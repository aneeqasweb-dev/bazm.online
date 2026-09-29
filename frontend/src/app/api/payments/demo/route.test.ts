// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  createOrder: vi.fn(),
  complete: vi.fn(),
}));
vi.mock("@/lib/auth/server-session", () => ({
  getAuthorizedSession: mocks.session,
}));
vi.mock("@/lib/firebase/admin", () => ({ getServerFirestore: () => ({}) }));
vi.mock("@bazm/functions/demo-payments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@bazm/functions/demo-payments")>()),
  DemoPaymentService: class {
    createOrder = mocks.createOrder;
    complete = mocks.complete;
  },
}));
import { POST } from "./route";
import { DomainError } from "@bazm/domain";
const checkout = {
  idempotencyKey: "demo-key-12345",
  shippingAddressId: "home",
  billingAddressId: null,
  couponCode: null,
  deliveryMethod: "STANDARD",
  paymentMethod: "EASYPAISA",
  customerNote: null,
};
const payment = {
  isDemo: true,
  status: "PAID",
  orderId: "order-1",
  paymentId: "pi_demo_1",
  transactionId: "txn_demo_1",
};
function request(body: unknown, origin = "http://localhost:3000") {
  return new Request("http://localhost:3000/api/payments/demo", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({
    claims: { uid: "customer" },
    reason: null,
  });
  mocks.createOrder.mockResolvedValue({ orderId: "order-1" });
  mocks.complete.mockResolvedValue(payment);
});
describe("demo payment API", () => {
  it.each(["EASYPAISA", "JAZZCASH", "CARD"])(
    "returns a paid receipt for %s",
    async (method) => {
      const response = await POST(
        request({
          checkout: { ...checkout, paymentMethod: method },
          ...(method === "CARD" ? {} : { mobileNumber: "03001234567" }),
        }),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(await response.json()).toEqual({
        ok: true,
        payment,
        confirmationUrl: "/checkout/confirmation/order-1",
      });
      expect(mocks.createOrder).toHaveBeenCalledWith(
        "customer",
        expect.any(Object),
      );
      expect(mocks.complete).toHaveBeenCalledWith("customer", "order-1");
    },
  );
  it("resumes the existing order without creating another", async () => {
    await POST(request({ orderId: "order-1" }));
    expect(mocks.createOrder).not.toHaveBeenCalled();
    expect(mocks.complete).toHaveBeenCalledWith("customer", "order-1");
  });
  it("requires an authorized account", async () => {
    mocks.session.mockResolvedValue({ claims: null, reason: "expired" });
    expect((await POST(request({ orderId: "order-1" }))).status).toBe(401);
    expect(mocks.complete).not.toHaveBeenCalled();
  });
  it("rejects cross-origin requests", async () => {
    expect(
      (await POST(request({ orderId: "order-1" }, "https://untrusted.example")))
        .status,
    ).toBe(403);
    expect(mocks.complete).not.toHaveBeenCalled();
  });
  it.each([
    { orderId: "order-1", cardNumber: "4242424242424242" },
    {
      checkout: { ...checkout, paymentStatus: "PAID" },
      mobileNumber: "03001234567",
    },
    { checkout },
  ])("rejects invalid or sensitive request fields", async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(mocks.createOrder).not.toHaveBeenCalled();
  });
  it("returns an order reference if payment fails after order creation", async () => {
    mocks.complete.mockRejectedValue(
      new DomainError("UNAVAILABLE", "Please retry."),
    );
    const response = await POST(
      request({ checkout, mobileNumber: "03001234567" }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Please retry.",
      orderId: "order-1",
    });
  });
  it("does not expose internal failures", async () => {
    mocks.complete.mockRejectedValue(new Error("private database detail"));
    const response = await POST(request({ orderId: "order-1" }));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain(
      "private database",
    );
  });
});
