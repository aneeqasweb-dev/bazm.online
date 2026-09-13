import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createUserWithEmailAndPassword: vi.fn(),
  deleteUser: vi.fn(),
  sendEmailVerification: vi.fn(),
  completeRegistration: vi.fn(),
  createServerSession: vi.fn(),
  getIdToken: vi.fn(),
}));

vi.mock("firebase/auth", () => ({
  createUserWithEmailAndPassword: mocks.createUserWithEmailAndPassword,
  deleteUser: mocks.deleteUser,
  sendEmailVerification: mocks.sendEmailVerification,
}));
vi.mock("@/lib/firebase/client", () => ({
  getFirebaseClientServices: () => ({ auth: {} }),
}));
vi.mock("./authorization-client", () => ({
  completeRegistration: mocks.completeRegistration,
}));
vi.mock("./session-client", () => ({
  createServerSession: mocks.createServerSession,
}));

import { registerCustomer } from "./register-customer";

const input = {
  name: "Test Customer",
  email: "customer@example.com",
  password: "Secure123",
  confirmPassword: "Secure123",
};

describe("customer registration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createUserWithEmailAndPassword.mockResolvedValue({
      user: { getIdToken: mocks.getIdToken },
    });
    mocks.completeRegistration.mockResolvedValue({ emailVerified: false });
    mocks.sendEmailVerification.mockResolvedValue(undefined);
    mocks.getIdToken.mockResolvedValue("fresh-id-token");
    mocks.createServerSession.mockResolvedValue(undefined);
    mocks.deleteUser.mockResolvedValue(undefined);
  });

  it("keeps the account and creates a session when verification delivery fails", async () => {
    mocks.sendEmailVerification.mockRejectedValue(new Error("Quota exceeded"));

    await expect(registerCustomer(input)).resolves.toEqual({
      verificationSent: false,
    });
    expect(mocks.deleteUser).not.toHaveBeenCalled();
    expect(mocks.createServerSession).toHaveBeenCalledWith("fresh-id-token");
  });

  it("reports successful verification delivery", async () => {
    await expect(registerCustomer(input)).resolves.toEqual({
      verificationSent: true,
    });
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it("still rolls back the new identity when profile registration fails", async () => {
    mocks.completeRegistration.mockRejectedValue(
      new Error("Registration failed"),
    );

    await expect(registerCustomer(input)).rejects.toThrow(
      "Registration failed",
    );
    expect(mocks.deleteUser).toHaveBeenCalledOnce();
    expect(mocks.sendEmailVerification).not.toHaveBeenCalled();
    expect(mocks.createServerSession).not.toHaveBeenCalled();
  });
});
