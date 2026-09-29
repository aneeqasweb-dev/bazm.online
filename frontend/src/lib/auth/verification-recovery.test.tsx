import { act, StrictMode, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FirebaseError } from "firebase/app";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  check: vi.fn(),
  apply: vi.fn(),
  resend: vi.fn(),
  reset: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/lib/auth/auth-client", () => ({
  checkEmailVerification: mocks.check,
  applyEmailVerificationCode: mocks.apply,
  sendVerificationEmail: mocks.resend,
  requestPasswordReset: mocks.reset,
}));
import { VerifyEmailClient } from "@/app/(auth)/verify-email/verify-email-client";
import { ForgotPasswordForm } from "@/app/(auth)/forgot-password/forgot-password-form";
let container: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.resetAllMocks();
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  mocks.check.mockResolvedValue("unverified");
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function render(node: ReactNode) {
  await act(async () => root.render(node));
}
async function click(text: string) {
  await act(async () =>
    [...container.querySelectorAll("button")]
      .find((b) => b.textContent === text)!
      .click(),
  );
}
describe("email verification and recovery", () => {
  it("redeems a one-use verification code only once in Strict Mode", async () => {
    mocks.apply.mockResolvedValue({ emailVerified: true });
    await render(
      <StrictMode>
        <VerifyEmailClient code="one-use-code" nextPath="/checkout" />
      </StrictMode>,
    );
    expect(mocks.apply).toHaveBeenCalledTimes(1);
    expect(
      container.querySelector('a[href="/checkout"]')?.textContent,
    ).toContain("Continue to checkout");
  });
  it("refreshes verified account access and returns to checkout without another login", async () => {
    await render(<VerifyEmailClient nextPath="/checkout" />);
    mocks.check.mockResolvedValueOnce("verified");
    await click("I’ve verified my email");
    expect(mocks.replace).toHaveBeenCalledWith("/checkout");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
  it("keeps unverified users on the page and preserves the destination in resend links", async () => {
    await render(<VerifyEmailClient nextPath="/checkout" />);
    await click("I’ve verified my email");
    expect(container.textContent).toContain("isn’t verified yet");
    expect(mocks.replace).not.toHaveBeenCalled();
    await click("Resend verification email");
    expect(mocks.resend).toHaveBeenCalledWith("/checkout");
  });
  it("asks signed-out visitors to sign in with their original destination", async () => {
    mocks.check.mockResolvedValue("signed-out");
    await render(<VerifyEmailClient nextPath="/product/bag/review" />);
    expect(
      container.querySelector('a[href="/login?next=%2Fproduct%2Fbag%2Freview"]')
        ?.textContent,
    ).toContain("Sign in");
  });
  it("handles expired verification links with a retry path", async () => {
    mocks.apply.mockRejectedValue(
      new FirebaseError("auth/expired-action-code", "Expired"),
    );
    await render(<VerifyEmailClient code="expired" nextPath="/checkout" />);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "expired",
    );
    expect(
      [...container.querySelectorAll("button")].some(
        (b) => b.textContent === "Resend verification email",
      ),
    ).toBe(true);
  });
  it("shows a retryable network error for password recovery without claiming email was sent", async () => {
    mocks.reset.mockRejectedValue(
      new FirebaseError("auth/network-request-failed", "Offline"),
    );
    await render(<ForgotPasswordForm nextPath="/checkout" />);
    container.querySelector<HTMLInputElement>('input[name="email"]')!.value =
      "shopper@example.test";
    await act(async () => {
      container
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
    });
    expect(container.textContent).toContain("Check your connection");
    expect(container.textContent).not.toContain("has been sent");
    expect(mocks.reset).toHaveBeenCalledWith(
      "shopper@example.test",
      "/checkout",
    );
    expect(
      container.querySelector('a[href="/login?next=%2Fcheckout"]'),
    ).not.toBeNull();
  });
});
