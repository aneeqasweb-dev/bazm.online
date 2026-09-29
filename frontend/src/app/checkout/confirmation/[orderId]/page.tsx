import { DomainError, orderDocumentSchema } from "@bazm/domain";
import { DemoPaymentService } from "@bazm/functions/demo-payments";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthorizedSession } from "@/lib/auth/server-session";
import { getServerFirestore } from "@/lib/firebase/admin";
import { PaymentConfirmation } from "../../confirmation-view";
import { DemoPaymentRetry } from "../../demo-payment-retry";
import styles from "../../checkout.module.css";

export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const session = await getAuthorizedSession({ requireVerified: true });
  if (!session.claims || session.reason)
    redirect(
      `/login?next=${encodeURIComponent(`/checkout/confirmation/${orderId}`)}`,
    );
  const firestore = getServerFirestore();
  const snapshot = await firestore.collection("orders").doc(orderId).get();
  if (!snapshot.exists) notFound();
  const order = orderDocumentSchema.parse(snapshot.data());
  if (order.userId !== session.claims.uid || !order.isDemo) notFound();
  if (order.status === "PENDING_PAYMENT")
    return (
      <main className={styles.status}>
        <span className={styles.sandboxTag}>Demo payment</span>
        <h1>One last step.</h1>
        <p>
          Your order is saved. Finish the simulated payment to see your
          confirmation. No real money will be charged.
        </p>
        <DemoPaymentRetry orderId={orderId} />
        <Link className={styles.backLink} href="/account">
          View your orders
        </Link>
      </main>
    );
  let receipt;
  try {
    receipt = await new DemoPaymentService(firestore).confirmation(
      session.claims.uid,
      orderId,
    );
  } catch (error) {
    if (
      error instanceof DomainError &&
      ["NOT_FOUND", "FORBIDDEN", "PRECONDITION_FAILED"].includes(error.code)
    )
      return (
        <main className={styles.status}>
          <h1>Check your order status.</h1>
          <p>This order no longer has a completed demo payment receipt.</p>
          <Link className={styles.primary} href="/account">
            View your orders
          </Link>
        </main>
      );
    throw error;
  }
  return <PaymentConfirmation receipt={receipt} />;
}
