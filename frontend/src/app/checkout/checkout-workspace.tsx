"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { callCommand } from "@/lib/commands/client";

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
    : "Checkout could not be completed.";
}

export function CheckoutWorkspace({ addresses }: { addresses: Address[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();
  async function saveAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(undefined);
    try {
      const form = new FormData(event.currentTarget);
      await callCommand("createAddress", {
        label: form.get("label"),
        recipientName: form.get("recipientName"),
        phone: form.get("phone"),
        line1: form.get("line1"),
        line2: null,
        area: form.get("area"),
        city: form.get("city"),
        province: form.get("province"),
        postalCode: form.get("postalCode"),
        deliveryInstructions: null,
      });
      router.refresh();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setPending(false);
    }
  }
  async function checkout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(undefined);
    try {
      const form = new FormData(event.currentTarget);
      const paymentMethod = form.get("paymentMethod");
      const result = await callCommand<{ ok: true; orderId: string }>(
        "createCheckout",
        {
          idempotencyKey: crypto.randomUUID().replaceAll("-", ""),
          shippingAddressId: form.get("shippingAddressId"),
          billingAddressId: null,
          couponCode:
            String(form.get("couponCode") ?? "")
              .trim()
              .toUpperCase() || null,
          deliveryMethod: form.get("deliveryMethod"),
          paymentMethod,
          customerNote: String(form.get("customerNote") ?? "").trim() || null,
        },
      );
      const orderId = result.orderId;
      if (paymentMethod === "CARD") {
        const payment = await callCommand<{
          ok: true;
          redirectUrl: string | null;
        }>("createPaymentAttempt", { orderId });
        if (payment.redirectUrl) {
          window.location.assign(payment.redirectUrl);
          return;
        }
      }
      router.push(`/account?order=${orderId}`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setPending(false);
    }
  }
  if (!addresses.length)
    return (
      <section className="mt-8 rounded-3xl border border-stone-800 bg-stone-900 p-6">
        <h2 className="text-2xl font-semibold">Add a delivery address</h2>
        <form className="mt-5 grid gap-3 sm:grid-cols-2" onSubmit={saveAddress}>
          <input
            className="field"
            name="label"
            placeholder="Label, e.g. Home"
            required
          />
          <input
            className="field"
            name="recipientName"
            placeholder="Recipient name"
            required
          />
          <input
            className="field"
            name="phone"
            placeholder="+923001234567"
            required
          />
          <input
            className="field"
            name="line1"
            placeholder="Address line"
            required
          />
          <input className="field" name="area" placeholder="Area" required />
          <input className="field" name="city" placeholder="City" required />
          <select className="field" name="province" required>
            <option value="">Province</option>
            <option value="PUNJAB">Punjab</option>
            <option value="SINDH">Sindh</option>
            <option value="KHYBER_PAKHTUNKHWA">Khyber Pakhtunkhwa</option>
            <option value="BALOCHISTAN">Balochistan</option>
            <option value="ISLAMABAD_CAPITAL_TERRITORY">Islamabad</option>
            <option value="GILGIT_BALTISTAN">Gilgit-Baltistan</option>
            <option value="AZAD_KASHMIR">Azad Kashmir</option>
          </select>
          <input
            className="field"
            name="postalCode"
            placeholder="Postal code"
            required
          />
          <button
            className="rounded-full bg-amber-300 px-5 py-3 font-semibold text-stone-950 disabled:opacity-50 sm:col-span-2"
            disabled={pending}
            type="submit"
          >
            Save address
          </button>
        </form>
        {message ? (
          <p aria-live="polite" className="mt-4 text-sm text-rose-200">
            {message}
          </p>
        ) : null}
      </section>
    );
  return (
    <form
      className="mt-8 space-y-6 rounded-3xl border border-stone-800 bg-stone-900 p-6"
      onSubmit={checkout}
    >
      <fieldset>
        <legend className="text-xl font-semibold">Delivery address</legend>
        <div className="mt-4 grid gap-3">
          {addresses.map((address) => (
            <label
              className="rounded-2xl border border-stone-700 p-4"
              key={address.id}
            >
              <input
                defaultChecked={address === addresses[0]}
                name="shippingAddressId"
                required
                type="radio"
                value={address.id}
              />{" "}
              <span className="ml-2 font-medium">{address.label}</span>
              <span className="mt-1 block text-sm text-stone-400">
                {address.recipientName} · {address.line1}, {address.city}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <select className="field" defaultValue="STANDARD" name="deliveryMethod">
          <option value="STANDARD">Standard delivery</option>
          <option value="EXPRESS">Express delivery</option>
        </select>
        <select
          className="field"
          defaultValue="CASH_ON_DELIVERY"
          name="paymentMethod"
        >
          <option value="CASH_ON_DELIVERY">Cash on delivery</option>
          <option value="CARD">Card (sandbox)</option>
        </select>
        <input
          className="field"
          name="couponCode"
          placeholder="Coupon code (optional)"
        />
        <textarea
          className="field min-h-24"
          name="customerNote"
          placeholder="Delivery note (optional)"
        />
      </div>
      <button
        className="w-full rounded-full bg-amber-300 px-5 py-3 font-semibold text-stone-950 disabled:opacity-50"
        disabled={pending}
        type="submit"
      >
        {pending ? "Placing order…" : "Place order"}
      </button>
      {message ? (
        <p aria-live="polite" className="text-sm text-rose-200">
          {message}
        </p>
      ) : null}
    </form>
  );
}
