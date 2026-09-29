import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  command: vi.fn(),
  pay: vi.fn(),
  push: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/lib/commands/client", () => ({ callCommand: mocks.command }));
vi.mock("@/lib/payments/demo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/payments/demo")>()),
  payDemoOrder: mocks.pay,
}));
import { CheckoutWorkspace } from "./checkout-workspace";
import { DemoPaymentError } from "@/lib/payments/demo";
const address = {
  id: "home-1",
  label: "Home",
  recipientName: "Test Shopper",
  line1: "12 Main Road",
  area: "Gulberg",
  city: "Lahore",
  province: "PUNJAB",
  postalCode: "54000",
};
const item = {
  variantId: "variant-1",
  requestedQuantity: 2,
  snapshot: {
    name: "Linen kurta",
    slug: "linen-kurta",
    brand: "Bazm",
    image: { url: "/sample.jpg", alt: "Linen kurta" },
    price: { amountMinor: 450000, currency: "PKR" as const },
    sku: "KURTA-M",
    color: "Ivory",
    size: "M",
  },
};
let container: HTMLDivElement, root: Root;
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
async function render(addresses = [address], items = [item]) {
  await act(async () =>
    root.render(<CheckoutWorkspace addresses={addresses} items={items} />),
  );
}
async function submit(selector = "#checkout-order") {
  await act(async () => {
    container
      .querySelector(selector)!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}
async function testDetails() {
  await act(async () =>
    [...container.querySelectorAll("button")]
      .find((b) => b.textContent === "Use test details")!
      .click(),
  );
}
function orderButton() {
  return container.querySelector<HTMLButtonElement>(
    'button[form="checkout-order"]',
  )!;
}
const paid = {
  orderId: "order-1",
  paymentId: "pi_demo_123",
  transactionId: "txn_demo_123",
  isDemo: true,
  status: "PAID",
};
describe("demo checkout interactions", () => {
  it("lets guests explore payment methods while keeping payment behind sign-in", async () => {
    await act(async () =>
      root.render(
        <CheckoutWorkspace
          addresses={[]}
          items={[item]}
          accountAction={{
            href: "/login?next=/checkout",
            label: "Sign in to pay",
            message: "Sign in to finish your order.",
          }}
        />,
      ),
    );
    expect(
      container.querySelectorAll('input[name="paymentMethod"]'),
    ).toHaveLength(3);
    await act(async () =>
      container.querySelector<HTMLInputElement>('input[value="CARD"]')!.click(),
    );
    expect(container.querySelector("#cardNumber")).not.toBeNull();
    await testDetails();
    await submit();
    expect(mocks.pay).not.toHaveBeenCalled();
    expect(mocks.command).not.toHaveBeenCalled();
    expect(
      container.querySelector('a[href="/login?next=/checkout"]')?.textContent,
    ).toContain("Sign in to pay");
    expect(orderButton()).toBeNull();
  });
  it.each(["EASYPAISA", "JAZZCASH", "CARD"])(
    "submits %s without transmitting card data",
    async (method) => {
      mocks.pay.mockResolvedValue(paid);
      await render();
      await act(async () =>
        container
          .querySelector<HTMLInputElement>(`input[value="${method}"]`)!
          .click(),
      );
      await testDetails();
      await submit();
      expect(mocks.pay).toHaveBeenCalledWith(
        expect.objectContaining({
          checkout: expect.objectContaining({
            paymentMethod: method,
            shippingAddressId: "home-1",
          }),
        }),
      );
      const sent = JSON.stringify(mocks.pay.mock.calls[0][0]);
      expect(sent).not.toContain("4242");
      expect(sent).not.toContain("cardCvv");
      expect(sent).not.toContain("cardHolder");
      expect(mocks.push).toHaveBeenCalledWith("/checkout/confirmation/order-1");
    },
  );
  it("focuses invalid fields and does not create an order", async () => {
    await render();
    await submit();
    expect(document.activeElement?.id).toBe("paymentMobile");
    expect(mocks.pay).not.toHaveBeenCalled();
    await act(async () =>
      container.querySelector<HTMLInputElement>('input[value="CARD"]')!.click(),
    );
    await submit();
    expect(document.activeElement?.id).toBe("cardHolder");
    expect(container.querySelectorAll('[aria-invalid="true"]')).toHaveLength(4);
  });
  it("blocks duplicate clicks and retries the same order after a payment error", async () => {
    let fail!: (error: Error) => void;
    mocks.pay
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            fail = reject;
          }),
      )
      .mockResolvedValueOnce(paid);
    await render();
    await testDetails();
    await submit();
    await submit();
    expect(mocks.pay).toHaveBeenCalledTimes(1);
    expect(orderButton().disabled).toBe(true);
    expect(container.textContent).toContain("Processing payment");
    await act(async () =>
      fail(new DemoPaymentError("Temporary failure", 503, "order-1")),
    );
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Temporary failure",
    );
    await submit();
    expect(mocks.pay).toHaveBeenLastCalledWith({ orderId: "order-1" });
    expect(mocks.push).toHaveBeenCalledWith("/checkout/confirmation/order-1");
  });
  it("reuses the idempotency key when the response is lost", async () => {
    mocks.pay
      .mockRejectedValueOnce(new TypeError("Network error"))
      .mockResolvedValueOnce(paid);
    await render();
    await testDetails();
    await submit();
    await submit();
    expect(mocks.pay.mock.calls[0][0]).toEqual(mocks.pay.mock.calls[1][0]);
  });
  it("requires an address and uses a newly saved address", async () => {
    mocks.command.mockResolvedValue({ ok: true, id: "new-address" });
    mocks.pay.mockResolvedValue(paid);
    await render([]);
    expect(orderButton().disabled).toBe(true);
    const values = {
      label: "Office",
      recipientName: "Test Shopper",
      phone: "+923001234567",
      line1: "12 Main Road",
      area: "Gulberg",
      city: "Lahore",
      province: "PUNJAB",
      postalCode: "54000",
    };
    for (const [name, value] of Object.entries(values))
      container.querySelector<HTMLInputElement | HTMLSelectElement>(
        `[name="${name}"]`,
      )!.value = value;
    await submit("form:not(#checkout-order)");
    expect(orderButton().disabled).toBe(false);
    await testDetails();
    await submit();
    expect(mocks.pay).toHaveBeenCalledWith(
      expect.objectContaining({
        checkout: expect.objectContaining({ shippingAddressId: "new-address" }),
      }),
    );
  });
  it("shows an empty bag instead of allowing an empty checkout", async () => {
    await render([address], []);
    expect(container.textContent).toContain("Your bag is empty");
    expect(container.querySelector("form")).toBeNull();
  });
});
