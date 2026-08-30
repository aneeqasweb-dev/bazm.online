import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  callable: vi.fn(),
  callableNames: [] as string[],
  createServerSession: vi.fn(),
  deleteServerSession: vi.fn(),
  getIdToken: vi.fn(),
  auth: {
    currentUser: null as null | Record<string, unknown>,
    authStateReady: vi.fn(),
  },
  setPersistence: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("firebase/auth", () => ({
  applyActionCode: vi.fn(),
  browserLocalPersistence: "local",
  confirmPasswordReset: vi.fn(),
  GoogleAuthProvider: class GoogleAuthProvider {},
  reload: vi.fn(),
  setPersistence: mocks.setPersistence,
  signInWithEmailAndPassword: mocks.signInWithEmailAndPassword,
  signInWithPopup: vi.fn(),
  signOut: mocks.signOut,
  verifyPasswordResetCode: vi.fn(),
}));

vi.mock("firebase/functions", () => ({
  httpsCallable: (_functions: unknown, name: string) => {
    mocks.callableNames.push(name);
    return mocks.callable;
  },
}));

vi.mock("@/lib/firebase/client", () => ({
  getFirebaseClientServices: () => ({
    auth: mocks.auth,
    functions: {},
  }),
}));

vi.mock("@/lib/env/client", () => ({
  getFirebaseClientEnv: () => ({
    NEXT_PUBLIC_ENABLE_GOOGLE_AUTH: "false",
  }),
}));

vi.mock("./session-client", () => ({
  createServerSession: mocks.createServerSession,
  deleteServerSession: mocks.deleteServerSession,
}));

import {
  isGoogleAuthConfigured,
  loginWithEmail,
  loginWithGoogle,
  logout,
  requestPasswordReset,
  sendVerificationEmail,
} from "./auth-client";

describe("authentication client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.callableNames = [];
    mocks.auth.currentUser = null;
    mocks.auth.authStateReady.mockResolvedValue(undefined);
    mocks.getIdToken.mockResolvedValue("fresh-id-token");
    mocks.callable.mockResolvedValue({
      data: { ok: true, role: "CUSTOMER", emailVerified: true },
    });
    mocks.signInWithEmailAndPassword.mockResolvedValue({
      user: { getIdToken: mocks.getIdToken },
    });
  });

  it("uses local persistence, refreshes claims, and creates a server session", async () => {
    await expect(
      loginWithEmail({ email: "customer@example.com", password: "Secure123" }),
    ).resolves.toMatchObject({ role: "CUSTOMER", emailVerified: true });
    expect(mocks.setPersistence).toHaveBeenCalledWith(
      expect.anything(),
      "local",
    );
    expect(mocks.callable).toHaveBeenCalledWith({});
    expect(mocks.getIdToken).toHaveBeenCalledWith(true);
    expect(mocks.createServerSession).toHaveBeenCalledWith("fresh-id-token");
  });

  it("propagates invalid login failures without creating a session", async () => {
    mocks.signInWithEmailAndPassword.mockRejectedValueOnce(
      new Error("INVALID_CREDENTIAL"),
    );
    await expect(
      loginWithEmail({ email: "customer@example.com", password: "wrong" }),
    ).rejects.toThrow("INVALID_CREDENTIAL");
    expect(mocks.createServerSession).not.toHaveBeenCalled();
  });

  it("clears both browser and server state on logout", async () => {
    await logout();
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(mocks.deleteServerSession).toHaveBeenCalledOnce();
  });

  it("fails closed when Google login is not configured", async () => {
    expect(isGoogleAuthConfigured(undefined)).toBe(false);
    expect(isGoogleAuthConfigured("false")).toBe(false);
    await expect(loginWithGoogle()).rejects.toThrow("GOOGLE_AUTH_DISABLED");
  });

  it("requests verification email through the trusted callable", async () => {
    mocks.auth.currentUser = { uid: "customer-1" };

    await sendVerificationEmail();

    expect(mocks.auth.authStateReady).toHaveBeenCalledOnce();
    expect(mocks.callableNames).toContain("sendVerificationEmail");
    expect(mocks.callable).toHaveBeenCalledWith({});
  });

  it("requests password reset through the trusted callable", async () => {
    await requestPasswordReset("customer@example.com");

    expect(mocks.callableNames).toContain("requestPasswordResetEmail");
    expect(mocks.callable).toHaveBeenCalledWith({
      email: "customer@example.com",
    });
  });
});
