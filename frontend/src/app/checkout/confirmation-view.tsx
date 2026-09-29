import type { DemoPaymentService } from "@bazm/functions/demo-payments";
import Link from "next/link";
import { formatPkr } from "@/components/store/product-card";
import { paymentLabels } from "@/lib/payments/demo";
import { CheckoutIcon } from "./checkout-icon";
import styles from "./checkout.module.css";

export function PaymentConfirmation({
  receipt,
}: {
  receipt: Awaited<ReturnType<DemoPaymentService["confirmation"]>>;
}) {
  return (
    <main className={styles.confirmation}>
      <div className={styles.successHeader}>
        <span className={styles.successCheck}>
          <CheckoutIcon name="check" />
        </span>
        <span className={styles.tag}>Paid · Demo payment</span>
        <h1>Payment successful.</h1>
        <p>
          Thank you, {receipt.shippingAddress.recipientName}. Your demo order is
          confirmed.
        </p>
        <p>No real money was charged. This is a simulated purchase.</p>
      </div>
      <div className={styles.receiptGrid}>
        <section className={styles.panel} aria-labelledby="receipt-title">
          <h2 id="receipt-title">Payment receipt</h2>
          <dl className={styles.receiptDetails}>
            <div>
              <dt>Order number</dt>
              <dd className={styles.reference}>{receipt.orderId}</dd>
            </div>
            <div>
              <dt>Payment method</dt>
              <dd>{paymentLabels[receipt.method]}</dd>
            </div>
            <div>
              <dt>Payment status</dt>
              <dd>Paid</dd>
            </div>
            <div>
              <dt>Payment ID</dt>
              <dd className={styles.reference}>{receipt.paymentId}</dd>
            </div>
            <div>
              <dt>Transaction ID</dt>
              <dd className={styles.reference}>{receipt.transactionId}</dd>
            </div>
            <div>
              <dt>Paid on</dt>
              <dd>
                {new Intl.DateTimeFormat("en-PK", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "Asia/Karachi",
                }).format(new Date(receipt.paidAt))}{" "}
                (PKT)
              </dd>
            </div>
          </dl>
          <div className={styles.deliveryReceipt}>
            <strong>
              Delivery address ·{" "}
              {receipt.deliveryMethod === "EXPRESS" ? "Express" : "Standard"}
            </strong>
            <p>
              {receipt.shippingAddress.recipientName}
              <br />
              {receipt.shippingAddress.line1}, {receipt.shippingAddress.area}
              <br />
              {receipt.shippingAddress.city},{" "}
              {receipt.shippingAddress.postalCode}
            </p>
          </div>
        </section>
        <section className={styles.panel} aria-labelledby="order-details-title">
          <h2 id="order-details-title">Your order</h2>
          <ul className={styles.receiptItems}>
            {receipt.items.map((item) => (
              <li key={item.variantId}>
                <div>
                  {item.productName}
                  <small>
                    {item.color} / {item.size} · Qty {item.quantity}
                  </small>
                </div>
                <strong>{formatPkr(item.lineTotal.amountMinor)}</strong>
              </li>
            ))}
          </ul>
          <dl className={styles.receiptTotals}>
            <div>
              <dt>Subtotal</dt>
              <dd>{formatPkr(receipt.totals.subtotal.amountMinor)}</dd>
            </div>
            <div>
              <dt>Delivery</dt>
              <dd>
                {receipt.totals.shipping.amountMinor
                  ? formatPkr(receipt.totals.shipping.amountMinor)
                  : "Free"}
              </dd>
            </div>
            <div>
              <dt>Discount</dt>
              <dd>−{formatPkr(receipt.totals.discount.amountMinor)}</dd>
            </div>
            <div>
              <dt>Tax</dt>
              <dd>{formatPkr(receipt.totals.tax.amountMinor)}</dd>
            </div>
            <div>
              <dt>Total paid</dt>
              <dd>{formatPkr(receipt.amount.amountMinor)}</dd>
            </div>
          </dl>
          <p className={styles.hint}>
            This receipt is saved to your account and remains available after
            you refresh.
          </p>
        </section>
      </div>
      <div className={styles.confirmationActions}>
        <Link
          className={styles.primary}
          href={`/account?order=${receipt.orderId}`}
        >
          View my orders <CheckoutIcon name="arrow" />
        </Link>
        <Link className={styles.backLink} href="/shop">
          Continue shopping →
        </Link>
      </div>
    </main>
  );
}
