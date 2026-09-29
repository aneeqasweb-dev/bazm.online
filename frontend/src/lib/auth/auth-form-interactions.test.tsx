import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FirebaseError } from "firebase/app";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/lib/auth/auth-client", () => ({
  isGoogleAuthEnabled: () => false,
  loginWithEmail: mocks.login,
  loginWithGoogle: vi.fn(),
}));
vi.mock("@/lib/auth/register-customer", () => ({
  registerCustomer: mocks.register,
  getRegistrationErrorMessage: () => "Please try signing in instead.",
}));

import { LoginForm } from "@/app/(auth)/login/login-form";
import { RegisterForm } from "@/app/(auth)/register/register-form";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.resetAllMocks();
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function render(node: ReactNode) {
  await act(async () => root.render(node));
}
function field(name: string) {
  return container.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
}
function fill(values: Record<string, string>) {
  for (const [name, value] of Object.entries(values)) field(name).value = value;
}
async function submit() {
  await act(async () => {
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}
const credentials = { email: "shopper@example.test", password: "SamplePass42" };
const signup = {
  ...credentials,
  name: "Sample Shopper",
};

describe("account access interactions", () => {
  it("preserves the checkout destination in sign-up and recovery links", async () => {
    await render(<LoginForm nextPath="/checkout" resetComplete={false} />);
    expect(
      container.querySelector('a[href="/register?next=%2Fcheckout"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('a[href="/forgot-password?next=%2Fcheckout"]'),
    ).not.toBeNull();
    await render(<RegisterForm nextPath="/checkout" />);
    expect(
      container.querySelector('a[href="/login?next=%2Fcheckout"]'),
    ).not.toBeNull();
    mocks.register.mockResolvedValue({ verificationSent: true });
    fill(signup);
    await submit();
    expect(mocks.register).toHaveBeenCalledWith(signup, "/checkout");
    expect(
      container.querySelector('a[href="/verify-email?next=%2Fcheckout"]'),
    ).not.toBeNull();
  });
  it("reveals and hides a password without submitting or changing it", async () => {
    await render(<LoginForm nextPath="/account" resetComplete={false} />);
    fill(credentials);
    const toggle = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Show password"]',
    )!;
    await act(async () => toggle.click());
    expect(field("password").type).toBe("text");
    expect(field("password").value).toBe(credentials.password);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(mocks.login).not.toHaveBeenCalled();
    await act(async () => toggle.click());
    expect(field("password").type).toBe("password");
  });
  it("focuses the invalid email and connects its inline error", async () => {
    await render(<LoginForm nextPath="/account" resetComplete={false} />);
    fill({ email: "not-an-email" });
    await submit();
    expect(document.activeElement).toBe(field("email"));
    expect(field("email").getAttribute("aria-invalid")).toBe("true");
    expect(
      document.getElementById(field("email").getAttribute("aria-describedby")!)
        ?.textContent,
    ).toContain("email");
    expect(mocks.login).not.toHaveBeenCalled();
  });
  it.each([
    [true, "/checkout"],
    [false, "/verify-email?next=%2Fcheckout"],
  ])(
    "routes verified=%s customers correctly after sign-in",
    async (emailVerified, destination) => {
      mocks.login.mockResolvedValue({ emailVerified });
      await render(<LoginForm nextPath="/checkout" resetComplete={false} />);
      fill(credentials);
      await submit();
      expect(mocks.login).toHaveBeenCalledWith(credentials);
      expect(mocks.replace).toHaveBeenCalledWith(destination);
    },
  );
  it("keeps the form usable after a wrong password", async () => {
    mocks.login.mockRejectedValue(
      new FirebaseError("auth/invalid-credential", "invalid"),
    );
    await render(<LoginForm nextPath="/account" resetComplete={false} />);
    fill(credentials);
    await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "email or password is incorrect",
    );
    expect(
      container.querySelector<HTMLButtonElement>('button[type="submit"]')
        ?.disabled,
    ).toBe(false);
    expect(field("email").value).toBe(credentials.email);
    expect(mocks.replace).not.toHaveBeenCalled();
  });
  it("does not submit twice while signing in", async () => {
    mocks.login.mockReturnValue(new Promise(() => {}));
    await render(<LoginForm nextPath="/account" resetComplete={false} />);
    fill(credentials);
    await submit();
    await submit();
    expect(mocks.login).toHaveBeenCalledTimes(1);
    expect(
      container.querySelector<HTMLButtonElement>('button[type="submit"]')
        ?.disabled,
    ).toBe(true);
  });
  it("keeps registration to three fields and helps correct a weak password", async () => {
    await render(<RegisterForm />);
    expect(container.querySelectorAll("input")).toHaveLength(3);
    fill({ ...signup, password: "weak" });
    await submit();
    expect(document.activeElement).toBe(field("password"));
    expect(field("password").getAttribute("aria-invalid")).toBe("true");
    expect(mocks.register).not.toHaveBeenCalled();
  });
  it.each([true, false])(
    "provides the verification next step when email sent=%s",
    async (verificationSent) => {
      mocks.register.mockResolvedValue({ verificationSent });
      await render(<RegisterForm />);
      fill(signup);
      await submit();
      expect(mocks.register).toHaveBeenCalledWith(signup, "/account");
      expect(container.querySelector("h1")?.textContent).toBe(
        "You’re almost there",
      );
      expect(
        container.querySelector('a[href="/verify-email"]')?.textContent,
      ).toContain("Continue");
      expect(container.querySelector('[role="status"]')?.textContent).toContain(
        verificationSent ? credentials.email : "couldn’t send",
      );
    },
  );
});
