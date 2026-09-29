"use client";

import { useState } from "react";
import {
  paymentLabels,
  type DemoPaymentMethod,
  type PaymentErrors,
  type PaymentField,
} from "@/lib/payments/demo";
import { CheckoutIcon } from "./checkout-icon";
import styles from "./checkout.module.css";

function PaymentInputs({
  method,
  errors,
  onClearError,
}: {
  method: DemoPaymentMethod;
  errors: PaymentErrors;
  onClearError: (field?: PaymentField) => void;
}) {
  const [values, setValues] = useState({
    paymentMobile: "",
    cardHolder: "",
    cardNumber: "",
    cardExpiry: "",
    cardCvv: "",
  });
  function field(name: PaymentField) {
    return {
      id: name,
      name,
      value: values[name],
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
        let value = event.target.value;
        if (name === "cardNumber")
          value = value
            .replace(/\D/g, "")
            .slice(0, 19)
            .replace(/(.{4})/g, "$1 ")
            .trim();
        if (name === "cardExpiry") {
          const digits = value.replace(/\D/g, "").slice(0, 4);
          value =
            digits.length > 2
              ? `${digits.slice(0, 2)}/${digits.slice(2)}`
              : digits;
        }
        if (name === "cardCvv") value = value.replace(/\D/g, "").slice(0, 4);
        setValues((current) => ({ ...current, [name]: value }));
        onClearError(name);
      },
      "aria-invalid": Boolean(errors[name]),
      "aria-describedby": errors[name] ? `${name}-error` : undefined,
      autoComplete: "off",
      required: true,
    };
  }
  function error(name: PaymentField) {
    return errors[name] ? (
      <span className={styles.fieldError} id={`${name}-error`}>
        {errors[name]}
      </span>
    ) : null;
  }
  function fillTestData() {
    onClearError();
    setValues({
      paymentMobile: "03001234567",
      cardHolder: "Demo Shopper",
      cardNumber: "4242 4242 4242 4242",
      cardExpiry: `12/${String(new Date().getFullYear() + 2).slice(-2)}`,
      cardCvv: "123",
    });
  }
  return (
    <div className={styles.gatewayForm}>
      <div className={styles.gatewayHeading}>
        <div>
          <h3>
            {method === "CARD"
              ? "Card details"
              : `${paymentLabels[method]} wallet`}
          </h3>
          <p>
            {method === "CARD"
              ? "A familiar card checkout. Completely simulated."
              : "Enter a test mobile number to try a wallet payment."}
          </p>
        </div>
        <button
          className={styles.textButton}
          type="button"
          onClick={fillTestData}
        >
          Use test details
        </button>
      </div>
      {method === "CARD" ? (
        <div className={styles.fieldGrid}>
          <label className={styles.fullWidth} htmlFor="cardHolder">
            Card holder name
            <input
              {...field("cardHolder")}
              placeholder="Name on card"
              maxLength={80}
            />
            {error("cardHolder")}
          </label>
          <label className={styles.fullWidth} htmlFor="cardNumber">
            Card number
            <div className={styles.cardInput}>
              <input
                {...field("cardNumber")}
                placeholder="4242 4242 4242 4242"
                inputMode="numeric"
                maxLength={23}
              />
              <CheckoutIcon name="card" />
            </div>
            {error("cardNumber")}
          </label>
          <label htmlFor="cardExpiry">
            Expiry date
            <input
              {...field("cardExpiry")}
              placeholder="MM/YY"
              inputMode="numeric"
              maxLength={5}
            />
            {error("cardExpiry")}
          </label>
          <label htmlFor="cardCvv">
            CVV
            <input
              {...field("cardCvv")}
              placeholder="123"
              inputMode="numeric"
              type="password"
              maxLength={4}
            />
            {error("cardCvv")}
          </label>
        </div>
      ) : (
        <label className={styles.walletInput} htmlFor="paymentMobile">
          Mobile number
          <input
            {...field("paymentMobile")}
            type="tel"
            inputMode="tel"
            placeholder="0300 1234567"
            maxLength={18}
          />
          {error("paymentMobile")}
          <span className={styles.hint}>
            Use 03001234567 or +923001234567 to try the demo.
          </span>
        </label>
      )}
      <p className={styles.paymentFootnote}>
        <CheckoutIcon name="lock" /> Use test details only. No money is charged.
        Card details stay in your browser.
      </p>
    </div>
  );
}

export function DemoPaymentFields({
  method,
  onChange,
  disabled,
  errors,
  onClearError,
}: {
  method: DemoPaymentMethod;
  onChange: (method: DemoPaymentMethod) => void;
  disabled: boolean;
  errors: PaymentErrors;
  onClearError: (field?: PaymentField) => void;
}) {
  return (
    <fieldset className={styles.panel} disabled={disabled} id="payment-methods">
      <legend className={styles.srOnly}>Payment method</legend>
      <div className={styles.sectionHeading}>
        <span className={styles.sectionIcon}>
          <CheckoutIcon name="card" />
        </span>
        <div>
          <h2>How would you like to pay?</h2>
          <p>Three ways to try your demo checkout.</p>
        </div>
        <span className={styles.sandboxTag}>Demo</span>
      </div>
      <div className={styles.methodCards}>
        {(["EASYPAISA", "JAZZCASH", "CARD"] as const).map((value) => (
          <label
            className={`${styles.methodCard} ${method === value ? styles.activeMethod : ""}`}
            key={value}
          >
            <input
              type="radio"
              name="paymentMethod"
              value={value}
              checked={method === value}
              onChange={() => onChange(value)}
            />
            <span
              className={`${styles.providerIcon} ${value === "EASYPAISA" ? styles.easypaisa : value === "JAZZCASH" ? styles.jazzcash : styles.bankCard}`}
            >
              <CheckoutIcon name={value === "CARD" ? "card" : "wallet"} />
            </span>
            <strong>{paymentLabels[value]}</strong>
            <small>
              {value === "CARD" ? "Visa & Mastercard style" : "Mobile wallet"}
            </small>
          </label>
        ))}
      </div>
      <PaymentInputs
        key={method}
        method={method}
        errors={errors}
        onClearError={onClearError}
      />
    </fieldset>
  );
}
