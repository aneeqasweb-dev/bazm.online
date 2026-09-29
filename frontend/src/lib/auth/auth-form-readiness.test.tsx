import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/auth/auth-client", () => ({
  isGoogleAuthEnabled: () => false,
  loginWithEmail: vi.fn(),
  loginWithGoogle: vi.fn(),
  logout: vi.fn(),
}));
vi.mock("@/lib/auth/register-customer", () => ({
  registerCustomer: vi.fn(),
  getRegistrationErrorMessage: vi.fn(),
}));

import { LoginForm } from "@/app/(auth)/login/login-form";
import { RegisterForm } from "@/app/(auth)/register/register-form";
import { LogoutButton } from "@/components/auth/logout-button";

describe("auth forms before hydration", () => {
  it("waits for the sign-out handler before enabling the button", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(<LogoutButton />);
    expect(container.querySelector("button")?.disabled).toBe(true);
  });
  it.each([
    [
      "login",
      <LoginForm key="login" nextPath="/account" resetComplete={false} />,
    ],
    ["registration", <RegisterForm key="registration" />],
  ])(
    "keeps %s credentials out of URLs and prevents early submission",
    (_name, form) => {
      const container = document.createElement("div");
      container.innerHTML = renderToStaticMarkup(form);
      expect(container.querySelector("form")?.method).toBe("post");
      expect(
        container.querySelector<HTMLButtonElement>('button[type="submit"]')
          ?.disabled,
      ).toBe(true);
    },
  );
});
