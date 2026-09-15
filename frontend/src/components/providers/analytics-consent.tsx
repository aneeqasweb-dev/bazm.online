"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";

const STORAGE_KEY = "bazm.analytics-consent.v1";
const CONSENT_EVENT = "bazm:analytics-consent";
type Consent = "denied" | "granted";

function consentSnapshot(): Consent | null {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "granted" || stored === "denied" ? stored : null;
}

function subscribeToConsent(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(CONSENT_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(CONSENT_EVENT, onStoreChange);
  };
}

async function applyConsent(consent: Consent) {
  const { setFirebaseAnalyticsConsent } =
    await import("@/lib/firebase/browser-integrations");
  await setFirebaseAnalyticsConsent(consent === "granted");
}

export function AnalyticsConsent() {
  const consent = useSyncExternalStore(
    subscribeToConsent,
    consentSnapshot,
    () => undefined,
  );
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (consent) {
      void applyConsent(consent).catch(() => undefined);
    }
  }, [consent]);

  function decide(next: Consent) {
    window.localStorage.setItem(STORAGE_KEY, next);
    window.dispatchEvent(new Event(CONSENT_EVENT));
    setEditing(false);
  }

  if (consent === undefined) return null;

  if (consent && !editing) {
    return (
      <button
        className="fixed right-4 bottom-4 z-50 rounded-full border border-stone-700 bg-stone-950 px-3 py-2 text-xs text-stone-300 shadow-lg hover:border-amber-300 hover:text-amber-200"
        onClick={() => setEditing(true)}
        type="button"
      >
        Privacy choices
      </button>
    );
  }

  return (
    <aside
      aria-label="Analytics consent"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-3xl rounded-2xl border border-stone-700 bg-stone-950 p-5 shadow-2xl"
      role="dialog"
    >
      <h2 className="text-lg font-semibold">Your privacy choices</h2>
      <p className="mt-2 text-sm leading-6 text-stone-300">
        We use essential services to keep your shopping bag and account working.
        With your permission, anonymous analytics help us improve your
        experience. Analytics stays off until you accept. Read our{" "}
        <Link className="underline" href="/privacy">
          privacy notice
        </Link>
        .
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          className="rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-stone-950"
          onClick={() => decide("granted")}
          type="button"
        >
          Accept analytics
        </button>
        <button
          className="rounded-full border border-stone-600 px-4 py-2 text-sm font-semibold"
          onClick={() => decide("denied")}
          type="button"
        >
          Decline analytics
        </button>
      </div>
    </aside>
  );
}
