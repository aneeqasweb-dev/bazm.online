import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  product: vi.fn(),
  session: vi.fn(),
  items: vi.fn(),
}));
vi.mock("@/lib/storefront/server", () => ({
  getPublishedProductBySlug: mocks.product,
}));
vi.mock("@/lib/auth/server-session", () => ({
  getAuthorizedSession: mocks.session,
}));
vi.mock("@/lib/reviews/server", () => ({
  listCustomerReviewItems: mocks.items,
}));
vi.mock("@/components/providers/firebase-browser-integrations", () => ({
  FirebaseBrowserIntegrations: () => null,
}));
vi.mock("@/components/store/store-shell", () => ({
  StoreShell: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/app/account/review-center", () => ({
  ReviewForm: ({ item }: { item: { productName: string } }) => (
    <form>{item.productName}</form>
  ),
}));
import ProductReviewPage from "./page";

async function render() {
  return renderToStaticMarkup(
    await ProductReviewPage({ params: Promise.resolve({ slug: "ivory-bag" }) }),
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.product.mockResolvedValue({
    product: { id: "bag-1", slug: "ivory-bag", name: "Ivory Bag" },
  });
});
describe("product review access", () => {
  it("keeps the chosen product in the sign-in destination and does not read a guest's orders", async () => {
    mocks.session.mockResolvedValue({ claims: null, reason: "expired" });
    const html = await render();
    expect(html).toContain("/login?next=%2Fproduct%2Fivory-bag%2Freview");
    expect(html).toContain("Sign in to review");
    expect(mocks.items).not.toHaveBeenCalled();
  });
  it("shows only the selected product's eligible purchases from the current account", async () => {
    mocks.session.mockResolvedValue({
      claims: { uid: "shopper-1" },
      reason: null,
    });
    mocks.items.mockResolvedValue([
      {
        orderId: "order-1",
        productId: "bag-1",
        variantId: "ivory-1",
        productName: "Eligible Ivory Bag",
      },
      {
        orderId: "order-2",
        productId: "bag-2",
        variantId: "black-1",
        productName: "Unrelated Black Bag",
      },
    ]);
    const html = await render();
    expect(mocks.items).toHaveBeenCalledWith("shopper-1");
    expect(html).toContain("Eligible Ivory Bag");
    expect(html).not.toContain("Unrelated Black Bag");
  });
  it("explains eligibility when the customer has no delivered purchase", async () => {
    mocks.session.mockResolvedValue({
      claims: { uid: "shopper-1" },
      reason: null,
    });
    mocks.items.mockResolvedValue([]);
    expect(await render()).toContain("Available after delivery");
  });
  it("requires verification before reading eligible orders", async () => {
    mocks.session.mockResolvedValue({
      claims: { uid: "shopper-1" },
      reason: "unverified",
    });
    expect(await render()).toContain("Verify your email to review");
    expect(mocks.items).not.toHaveBeenCalled();
  });
});
