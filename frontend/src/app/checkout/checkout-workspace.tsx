"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useSyncExternalStore, type FormEvent } from "react";

import type { CartLine } from "@/components/store/cart-panel";
import { formatPkr } from "@/components/store/product-card";
import { callCommand } from "@/lib/commands/client";

import {
  DemoPaymentError,
  normalizeMobile,
  payDemoOrder,
  validateDemoPayment,
  type DemoCheckoutRequest,
  type DemoPaymentMethod,
  type PaymentErrors,
} from "@/lib/payments/demo";
import { DemoPaymentFields } from "./demo-payment-fields";

import { CheckoutIcon } from "./checkout-icon";
import styles from "./checkout.module.css";

const subscribeToHydration = () => () => undefined;
const clientReady = () => true;
const serverReady = () => false;

type Address = {
  id: string;
  label: string;
  recipientName: string;
  line1: string;
  area: string;
  city: string;
  province: string;
  postalCode: string;
};

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Checkout could not be completed. Please try again.";
}

export function CheckoutWorkspace({
  addresses,
  items,
  accountAction,
}: {
  addresses: Address[];
  items: CartLine[];
  accountAction?: { href: string; label: string; message: string };
}) {
  const router = useRouter();
  const ready = useSyncExternalStore(
    subscribeToHydration,
    clientReady,
    serverReady,
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();
  const [addressMessage, setAddressMessage] = useState<string>();
  const [savedAddresses, setSavedAddresses] = useState<Address[]>([]);
  const [addingAddress, setAddingAddress] = useState(!addresses.length);
  const [selectedAddress, setSelectedAddress] = useState(
    addresses[0]?.id ?? "",
  );
  const [paymentMethod, setPaymentMethod] =
    useState<DemoPaymentMethod>("EASYPAISA");
  const [createdOrderId, setCreatedOrderId] = useState<string>();
  const busy = useRef(false);
  const checkoutRequest = useRef<DemoCheckoutRequest | null>(null);
  const [checkoutLocked, setCheckoutLocked] = useState(false);
  const [paymentErrors, setPaymentErrors] = useState<PaymentErrors>({});
  const [paymentPhase, setPaymentPhase] = useState<
    "idle" | "processing" | "success"
  >("idle");
  const availableAddresses = [
    ...savedAddresses,
    ...addresses.filter(
      (address) => !savedAddresses.some((saved) => saved.id === address.id),
    ),
  ];
  const subtotal = items.reduce(
    (sum, item) =>
      sum + item.snapshot.price.amountMinor * item.requestedQuantity,
    0,
  );
  const quantity = items.reduce((sum, item) => sum + item.requestedQuantity, 0);

  async function saveAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || busy.current || accountAction) return;
    const form = new FormData(event.currentTarget);
    busy.current = true;
    setPending(true);
    setAddressMessage(undefined);
    try {
      const address = {
        label: String(form.get("label")),
        recipientName: String(form.get("recipientName")),
        phone: String(form.get("phone")),
        line1: String(form.get("line1")),
        line2: null,
        area: String(form.get("area")),
        city: String(form.get("city")),
        province: String(form.get("province")),
        postalCode: String(form.get("postalCode")),
        deliveryInstructions: null,
      };
      const result = await callCommand<{ ok: true; id: string }>(
        "createAddress",
        address,
      );
      setSavedAddresses((previous) => [
        { ...address, id: result.id },
        ...previous,
      ]);
      setSelectedAddress(result.id);
      setAddingAddress(false);
    } catch (error) {
      setAddressMessage(errorMessage(error));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function checkout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !ready ||
      busy.current ||
      accountAction ||
      !selectedAddress ||
      addingAddress ||
      !items.length
    )
      return;
    const form = new FormData(event.currentTarget);
    if (!checkoutRequest.current && !createdOrderId) {
      const errors = validateDemoPayment(paymentMethod, form);
      setPaymentErrors(errors);
      const invalidField = Object.keys(errors)[0];
      if (invalidField) {
        document.getElementById(invalidField)?.focus();
        return;
      }
      if (!event.currentTarget.reportValidity()) return;
      checkoutRequest.current = {
        checkout: {
          idempotencyKey: crypto.randomUUID().replaceAll("-", ""),
          shippingAddressId: selectedAddress,
          billingAddressId: null,
          couponCode:
            String(form.get("couponCode") ?? "")
              .trim()
              .toUpperCase() || null,
          deliveryMethod:
            form.get("deliveryMethod") === "EXPRESS" ? "EXPRESS" : "STANDARD",
          paymentMethod,
          customerNote: String(form.get("customerNote") ?? "").trim() || null,
        },
        ...(paymentMethod !== "CARD"
          ? {
              mobileNumber: normalizeMobile(
                String(form.get("paymentMobile") ?? ""),
              ),
            }
          : {}),
      };
    }
    busy.current = true;
    setPending(true);
    setCheckoutLocked(true);
    setPaymentPhase("processing");
    setMessage(undefined);
    try {
      const result = await payDemoOrder(
        createdOrderId ? { orderId: createdOrderId } : checkoutRequest.current!,
      );
      setCreatedOrderId(result.orderId);
      setPaymentPhase("success");
      router.push(
        `/checkout/confirmation/${encodeURIComponent(result.orderId)}`,
      );
    } catch (error) {
      setPaymentPhase("idle");
      if (error instanceof DemoPaymentError) {
        if (error.orderId) setCreatedOrderId(error.orderId);
        else if (error.status >= 400 && error.status < 500) {
          checkoutRequest.current = null;
          setCheckoutLocked(false);
        }
      }
      setMessage(errorMessage(error));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  if (!items.length) {
    return (
      <main className={styles.empty}>
        <span className={styles.emptyIcon}>
          <CheckoutIcon name="bag" />
        </span>
        <p className={styles.eyebrow}>A little something awaits</p>
        <h1>Your bag is empty</h1>
        <p>Find your next favourite piece, then meet us back here.</p>
        <Link className={styles.primary} href="/shop">
          Explore the collection <CheckoutIcon name="arrow" />
        </Link>
      </main>
    );
  }

  return (
    <main className={styles.main}>
      <nav aria-label="Checkout progress" className={styles.progress}>
        <ol>
          <li>
            <Link href="/cart">
              <span className={styles.completed}>
                <CheckoutIcon name="check" />
              </span>{" "}
              Shopping bag
            </Link>
          </li>
          <li aria-current="step">
            <span className={styles.current}>2</span> Delivery & payment
          </li>
          <li>
            <span>3</span> Confirmation
          </li>
        </ol>
      </nav>
      <div className={styles.intro}>
        <p className={styles.eyebrow}>The finishing touches</p>
        <h1>Make it yours.</h1>
        <p>Your favourites, one step away. Try a complete demo payment.</p>
        <a className={styles.paymentJump} href="#payment-methods">
          Choose a payment method <CheckoutIcon name="arrow" />
        </a>
      </div>
      <div className={styles.demoNotice}>
        <span className={styles.sandboxTag}>DEMO CHECKOUT</span>
        <p>
          Made for learning. Every payment is simulated — no real money is
          charged.
        </p>
      </div>
      <div className={styles.grid}>
        <div className={styles.sections}>
          <section className={styles.panel} aria-labelledby="delivery-title">
            <div className={styles.sectionHeading}>
              <span className={styles.sectionIcon}>
                <CheckoutIcon name="pin" />
              </span>
              <div>
                <h2 id="delivery-title">Delivery address</h2>
                <p>Where should we send your order?</p>
              </div>
              {!accountAction && !addingAddress && !checkoutLocked ? (
                <button
                  className={styles.textButton}
                  type="button"
                  disabled={pending}
                  onClick={() => setAddingAddress(true)}
                >
                  + Add new
                </button>
              ) : null}
            </div>
            {accountAction ? (
              <div className={styles.accountPrompt}>
                <p>{accountAction.message}</p>
                <Link className={styles.primary} href={accountAction.href}>
                  {accountAction.label} <CheckoutIcon name="arrow" />
                </Link>
                <p className={styles.hint}>
                  You can explore all three payment options below.
                </p>
              </div>
            ) : addingAddress ? (
              <form
                className={styles.addressForm}
                onSubmit={saveAddress}
                method="post"
              >
                <fieldset disabled={!ready || pending}>
                  <legend className={styles.srOnly}>
                    Add a delivery address
                  </legend>
                  <div className={styles.fieldGrid}>
                    <label>
                      Full name
                      <input
                        name="recipientName"
                        autoComplete="shipping name"
                        minLength={2}
                        maxLength={80}
                        placeholder="Recipient’s full name"
                        required
                      />
                    </label>
                    <label>
                      Phone number
                      <input
                        name="phone"
                        type="tel"
                        autoComplete="shipping tel"
                        pattern="\+92[0-9]{10}"
                        title="Use +92 followed by 10 digits"
                        placeholder="+923001234567"
                        required
                      />
                      <span className={styles.hint}>
                        For delivery updates · +92 and 10 digits
                      </span>
                    </label>
                    <label className={styles.fullWidth}>
                      Street address
                      <input
                        name="line1"
                        autoComplete="shipping address-line1"
                        minLength={3}
                        maxLength={120}
                        placeholder="House number, building and street"
                        required
                      />
                    </label>
                    <label>
                      Area / neighbourhood
                      <input
                        name="area"
                        minLength={2}
                        maxLength={80}
                        placeholder="e.g. Gulberg"
                        required
                      />
                    </label>
                    <label>
                      City
                      <input
                        name="city"
                        autoComplete="shipping address-level2"
                        minLength={2}
                        maxLength={80}
                        placeholder="e.g. Lahore"
                        required
                      />
                    </label>
                    <label>
                      Province
                      <select
                        name="province"
                        autoComplete="shipping address-level1"
                        defaultValue=""
                        required
                      >
                        <option value="" disabled>
                          Select your province
                        </option>
                        <option value="PUNJAB">Punjab</option>
                        <option value="SINDH">Sindh</option>
                        <option value="KHYBER_PAKHTUNKHWA">
                          Khyber Pakhtunkhwa
                        </option>
                        <option value="BALOCHISTAN">Balochistan</option>
                        <option value="ISLAMABAD_CAPITAL_TERRITORY">
                          Islamabad
                        </option>
                        <option value="GILGIT_BALTISTAN">
                          Gilgit-Baltistan
                        </option>
                        <option value="AZAD_KASHMIR">Azad Kashmir</option>
                      </select>
                    </label>
                    <label>
                      Postal code
                      <input
                        name="postalCode"
                        autoComplete="shipping postal-code"
                        inputMode="numeric"
                        pattern="[0-9]{5}"
                        maxLength={5}
                        title="Enter a 5-digit postal code"
                        placeholder="54000"
                        required
                      />
                    </label>
                    <label className={styles.fullWidth}>
                      Save address as
                      <input
                        name="label"
                        minLength={2}
                        maxLength={60}
                        placeholder="e.g. Home or Office"
                        required
                      />
                    </label>
                  </div>
                  <div className={styles.addressActions}>
                    <button className={styles.primary} type="submit">
                      {pending ? "Saving address…" : "Save address"}
                      <CheckoutIcon name="arrow" />
                    </button>
                    {availableAddresses.length ? (
                      <button
                        className={styles.textButton}
                        type="button"
                        onClick={() => {
                          setAddingAddress(false);
                          setAddressMessage(undefined);
                        }}
                      >
                        Cancel
                      </button>
                    ) : null}
                  </div>
                </fieldset>
                {addressMessage ? (
                  <p role="alert" className={styles.error}>
                    {addressMessage}
                  </p>
                ) : null}
              </form>
            ) : (
              <fieldset
                className={styles.addresses}
                disabled={!ready || pending || checkoutLocked}
              >
                <legend className={styles.srOnly}>
                  Choose a delivery address
                </legend>
                {availableAddresses.map((address) => (
                  <label className={styles.addressOption} key={address.id}>
                    <input
                      type="radio"
                      name="shippingAddressId"
                      form="checkout-order"
                      checked={selectedAddress === address.id}
                      onChange={() => setSelectedAddress(address.id)}
                      value={address.id}
                      required
                    />
                    <span>
                      <span className={styles.addressName}>
                        {address.recipientName}
                        <span className={styles.tag}>{address.label}</span>
                      </span>
                      <span className={styles.addressLines}>
                        {address.line1}, {address.area}
                        <br />
                        {address.city}, {address.postalCode}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
            )}
          </section>

          <form
            id="checkout-order"
            method="post"
            noValidate
            onSubmit={checkout}
            className={styles.sections}
            aria-busy={pending}
          >
            <fieldset
              className={styles.panel}
              disabled={!ready || pending || checkoutLocked}
            >
              <legend className={styles.srOnly}>Delivery method</legend>
              <div className={styles.sectionHeading}>
                <span className={styles.sectionIcon}>
                  <CheckoutIcon name="truck" />
                </span>
                <div>
                  <h2>Delivery method</h2>
                  <p>A little closer to your doorstep.</p>
                </div>
              </div>
              <div className={styles.deliveryOptions}>
                <label className={styles.deliveryOption}>
                  <input
                    name="deliveryMethod"
                    type="radio"
                    value="STANDARD"
                    defaultChecked
                  />
                  <span>
                    <strong>Standard delivery</strong>
                    <small>Our regular delivery service</small>
                  </span>
                </label>
                <label className={styles.deliveryOption}>
                  <input name="deliveryMethod" type="radio" value="EXPRESS" />
                  <span>
                    <strong>Express delivery</strong>
                    <small>For when you need it sooner</small>
                  </span>
                </label>
              </div>
              <p className={styles.hint}>
                Delivery charges are calculated when you place your order.
              </p>
            </fieldset>

            <DemoPaymentFields
              method={paymentMethod}
              onChange={(method) => {
                setPaymentMethod(method);
                setPaymentErrors({});
              }}
              disabled={!ready || pending || checkoutLocked}
              errors={paymentErrors}
              onClearError={(field) =>
                setPaymentErrors((current) => {
                  if (!field) return {};
                  const next = { ...current };
                  delete next[field];
                  return next;
                })
              }
            />

            <div className={styles.panel}>
              <details className={styles.note}>
                <summary>
                  Add a delivery note <span>Optional</span>
                </summary>
                <label className={styles.srOnly} htmlFor="customer-note">
                  Delivery note
                </label>
                <textarea
                  id="customer-note"
                  name="customerNote"
                  maxLength={500}
                  disabled={!ready || pending || checkoutLocked}
                  placeholder="Anything we should know? e.g. Please call on arrival."
                  rows={3}
                />
              </details>
            </div>
          </form>
          <Link className={styles.backLink} href="/cart">
            ← Return to shopping bag
          </Link>
        </div>

        <aside className={styles.summary} aria-labelledby="summary-title">
          <div className={styles.summaryHeader}>
            <h2 id="summary-title">Your order</h2>
            <span>
              {quantity} {quantity === 1 ? "item" : "items"}
            </span>
            <Link href="/cart">Edit bag</Link>
          </div>
          <ul className={styles.items}>
            {items.map((item) => (
              <li key={item.variantId} className={styles.item}>
                <div className={styles.itemImage}>
                  <Image
                    src={item.snapshot.image.url}
                    alt={item.snapshot.image.alt}
                    fill
                    sizes="72px"
                    className={styles.productImage}
                  />
                  <span>{item.requestedQuantity}</span>
                </div>
                <div className={styles.itemCopy}>
                  <p className={styles.brand}>{item.snapshot.brand}</p>
                  <Link href={`/product/${item.snapshot.slug}`}>
                    {item.snapshot.name}
                  </Link>
                  <p>
                    {item.snapshot.color} / {item.snapshot.size}
                  </p>
                  <strong>
                    {formatPkr(
                      item.snapshot.price.amountMinor * item.requestedQuantity,
                    )}
                  </strong>
                </div>
              </li>
            ))}
          </ul>
          <details className={styles.coupon}>
            <summary>
              Have a promo code? <span aria-hidden="true">+</span>
            </summary>
            <label className={styles.srOnly} htmlFor="coupon-code">
              Promo code
            </label>
            <input
              id="coupon-code"
              name="couponCode"
              form="checkout-order"
              placeholder="Enter promo code"
              maxLength={40}
              pattern="[A-Za-z0-9\-]{3,40}"
              title="Use 3–40 letters, numbers or hyphens"
              disabled={!ready || pending || checkoutLocked}
            />
            <p className={styles.hint}>
              Your code will be checked when you place the order.
            </p>
          </details>
          <dl className={styles.totals}>
            <div>
              <dt>Subtotal</dt>
              <dd>{formatPkr(subtotal)}</dd>
            </div>
            <div>
              <dt>Delivery</dt>
              <dd>Calculated on order</dd>
            </div>
            <div>
              <dt>Discounts</dt>
              <dd>Applied on order</dd>
            </div>
            <div className={styles.total}>
              <dt>
                Estimated subtotal<small>Before delivery & discounts</small>
              </dt>
              <dd>
                <span>PKR</span>
                {(subtotal / 100).toLocaleString("en-PK", {
                  minimumFractionDigits: 2,
                })}
              </dd>
            </div>
          </dl>
          <p className={styles.summaryNote}>
            Final prices, delivery charges and discounts are confirmed when your
            order is placed.
          </p>
          {message ? (
            <div role="alert" className={styles.error}>
              <p>{message}</p>
              {createdOrderId ? (
                <Link href={`/account?order=${createdOrderId}`}>
                  View your saved order →
                </Link>
              ) : null}
            </div>
          ) : null}
          {accountAction ? (
            <Link className={styles.primary} href={accountAction.href}>
              {accountAction.label} <CheckoutIcon name="arrow" />
            </Link>
          ) : (
            <button
              className={styles.primary}
              type="submit"
              form="checkout-order"
              disabled={
                !ready ||
                pending ||
                addingAddress ||
                !selectedAddress ||
                paymentPhase === "success"
              }
            >
              {paymentPhase === "processing"
                ? "Processing payment…"
                : paymentPhase === "success"
                  ? "Payment successful"
                  : checkoutLocked
                    ? "Retry payment"
                    : "Pay Now"}
              {paymentPhase === "processing" ? (
                <span className={styles.spinner} aria-hidden="true" />
              ) : (
                <CheckoutIcon
                  name={paymentPhase === "success" ? "check" : "arrow"}
                />
              )}
            </button>
          )}
          <p className={styles.belowButton} role="status" aria-live="polite">
            {accountAction
              ? "Your items stay saved while you sign in."
              : addingAddress || !selectedAddress
                ? "Save your delivery address to continue."
                : paymentPhase === "processing"
                  ? "Simulating your payment. This takes about 2 seconds."
                  : paymentPhase === "success"
                    ? "Your demo order is paid. Opening your confirmation…"
                    : "Demo payment · No real money charged"}
          </p>
          <p className={styles.terms}>
            By placing your order, you agree to our{" "}
            <Link href="/terms">Terms & conditions</Link> and{" "}
            <Link href="/privacy">Privacy policy</Link>.
          </p>
          <div className={styles.help}>
            <CheckoutIcon name="bag" />
            <div>
              <strong>A little help, if you need it.</strong>
              <p>
                Our team is here for you.{" "}
                <Link href="/contact">Get in touch</Link>
              </p>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
