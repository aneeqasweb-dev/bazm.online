"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import styles from "./auth-shell.module.css";

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
  activeTab,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  activeTab?: "login" | "register";
}) {
  return (
    <main className={`storefront ${styles.page}`}>
      <header className={styles.header}>
        <Link className={styles.wordmark} href="/" aria-label="Bazm home">
          bazm
        </Link>
        <Link className={styles.back} href="/">
          ← Back to shopping
        </Link>
      </header>
      <div className={styles.card}>
        <aside className={styles.editorial} aria-label="The Bazm collection">
          <Image
            src="https://res.cloudinary.com/veuu5xof/image/upload/v1789496151/bazm/demo/rose-ayla-suit.png"
            alt="The dusty rose embroidered Ayla ensemble"
            fill
            sizes="(min-width: 900px) 440px, 1px"
            className={styles.photo}
          />
          <div className={styles.caption}>
            <p>THE ART OF GATHERING</p>
            <h2>
              A little more
              <br />
              <em>you.</em>
            </h2>
            <p>Your favourite pieces. All in one place.</p>
          </div>
        </aside>
        <section className={styles.content}>
          {activeTab ? (
            <nav className={styles.tabs} aria-label="Account access">
              <Link
                href="/login"
                aria-current={activeTab === "login" ? "page" : undefined}
              >
                Sign in
              </Link>
              <Link
                href="/register"
                aria-current={activeTab === "register" ? "page" : undefined}
              >
                Create account
              </Link>
            </nav>
          ) : null}
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.description}>{description}</p>
          {children}
        </section>
      </div>
      <footer className={styles.footer}>
        <span>
          Need a hand? <Link href="/contact">We’re here to help</Link>
        </span>
        <span>
          <Link href="/privacy">Privacy</Link> ·{" "}
          <Link href="/terms">Terms</Link>
        </span>
      </footer>
    </main>
  );
}

export function AuthMessage({
  children,
  kind = "error",
}: {
  children: ReactNode;
  kind?: "error" | "info" | "success";
}) {
  const styles = {
    error: "bg-red-50 text-red-800",
    info: "bg-stone-900 text-stone-300",
    success: "bg-emerald-50 text-emerald-800",
  }[kind];

  return (
    <p
      className={`rounded-xl p-3 text-sm ${styles}`}
      role={kind === "error" ? "alert" : "status"}
    >
      {children}
    </p>
  );
}

export function AuthField({
  label,
  name,
  type = "text",
  autoComplete,
  error,
  hint,
  defaultValue,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete: string;
  error?: string;
  hint?: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  const descriptionId = `${name}-description`;
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";
  return (
    <div>
      <label className="mb-2 block text-sm font-medium" htmlFor={name}>
        {label}
      </label>
      <div className="relative">
        <input
          aria-describedby={error || hint ? descriptionId : undefined}
          aria-invalid={Boolean(error)}
          autoComplete={autoComplete}
          className={`h-12 w-full rounded-md border border-stone-700 bg-stone-900 px-4 text-base outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20 ${isPassword ? "pr-20" : ""}`}
          defaultValue={defaultValue}
          id={name}
          name={name}
          type={isPassword && showPassword ? "text" : type}
          placeholder={
            placeholder ?? (type === "email" ? "you@example.com" : undefined)
          }
          autoCapitalize={type === "email" || isPassword ? "none" : undefined}
          spellCheck={type === "email" || isPassword ? false : undefined}
        />
        {isPassword ? (
          <button
            type="button"
            className="absolute inset-y-0 right-1 min-w-16 px-2 text-sm font-medium text-amber-300"
            aria-label={`${showPassword ? "Hide" : "Show"} ${label.toLowerCase()}`}
            aria-pressed={showPassword}
            onClick={() => setShowPassword((value) => !value)}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        ) : null}
      </div>
      {error ? (
        <p className={`mt-2 text-sm ${styles.fieldError}`} id={descriptionId}>
          {error}
        </p>
      ) : hint ? (
        <p className="mt-2 text-sm text-stone-500" id={descriptionId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
