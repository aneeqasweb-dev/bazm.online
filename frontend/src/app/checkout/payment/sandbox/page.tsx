import Link from "next/link";
import { redirect } from "next/navigation";

import { getAuthorizedSession } from "@/lib/auth/server-session";
import { CheckoutIcon } from "../../checkout-icon";
import styles from "../../checkout.module.css";

export default async function SandboxPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ attempt?: string }>;
}) {
  const session = await getAuthorizedSession({ requireVerified: true });
  if (!session.claims) redirect("/login?reason=session-expired&next=/checkout");
  const { attempt } = await searchParams;
  return (
    <main className={styles.status}>
      <span className={styles.emptyIcon}>
        <CheckoutIcon name="card" />
      </span>
      <p className={styles.eyebrow}>Test payment session</p>
      <h1>Your order is saved.</h1>
      <p>
        You’ve reached the sandbox payment page. No payment has been collected
        here, and you don’t need to enter any card details.
      </p>
      <p>You can view your order and its payment status in your account.</p>
      <span className={styles.sandboxTag}>Sandbox · No real payment</span>
      {attempt ? (
        <p className={styles.hint}>Session reference: {attempt.slice(-10)}</p>
      ) : null}
      <Link className={styles.primary} href="/account">
        View your order <CheckoutIcon name="arrow" />
      </Link>
      <Link className={styles.backLink} href="/shop">
        Continue shopping
      </Link>
    </main>
  );
}
