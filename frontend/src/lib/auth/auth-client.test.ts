import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  synchronizeAuthorization: vi.fn(),
  completeRegistration: vi.fn(),
  createServerSession: vi.fn(),
  deleteServerSession: vi.fn(),
  getIdToken: vi.fn(),
  auth: {
    currentUser: null as null | Record<string, unknown>,
    authStateReady: vi.fn(),
  },
  setPersistence: vi.fn(),
  sendEmailVerification: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("firebase/auth", () => ({
  applyActionCode: vi.fn(),
  browserLocalPersistence: "local",
  confirmPasswordReset: vi.fn(),
  GoogleAuthProvider: class GoogleAuthProvider {},
  reload: vi.fn(),
  sendEmailVerification: mocks.sendEmailVerification,
  sendPasswordResetEmail: mocks.sendPasswordResetEmail,
  setPersistence: mocks.setPersistence,
  signInWithEmailAndPassword: mocks.signInWithEmailAndPassword,
  signInWithPopup: vi.fn(),
  signOut: mocks.signOut,
  verifyPasswordResetCode: vi.fn(),
}));

vi.mock("@/lib/firebase/client", () => ({
  getFirebaseClientServices: () => ({
    auth: mocks.auth,
  }),
}));

vi.mock("./authorization-client", () => ({
  completeRegistration: mocks.completeRegistration,
  synchronizeAuthorization: mocks.synchronizeAuthorization,
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
    mocks.auth.currentUser = null;
    mocks.auth.authStateReady.mockResolvedValue(undefined);
    mocks.getIdToken.mockResolvedValue("fresh-id-token");
    mocks.synchronizeAuthorization.mockResolvedValue({
      ok: true,
      role: "CUSTOMER",
      emailVerified: true,
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
    expect(mocks.synchronizeAuthorization).toHaveBeenCalledWith(
      expect.anything(),
    );
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

  it("requests verification email through Firebase Auth", async () => {
    mocks.auth.currentUser = { uid: "customer-1" };

    await sendVerificationEmail();

    expect(mocks.auth.authStateReady).toHaveBeenCalledOnce();
    expect(mocks.sendEmailVerification).toHaveBeenCalledWith(
      mocks.auth.currentUser,
    );
  });

  it("requests password reset through Firebase Auth", async () => {
    await requestPasswordReset("customer@example.com");

    expect(mocks.sendPasswordResetEmail).toHaveBeenCalledWith(
      mocks.auth,
      "customer@example.com",
    );
  });
});
