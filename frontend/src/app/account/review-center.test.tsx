import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ command: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/lib/commands/client", () => ({ callCommand: mocks.command }));
vi.mock("@/lib/media/client", () => ({ uploadMedia: vi.fn() }));
import { ReviewForm } from "./review-center";

const item = {
  orderId: "order-1",
  productId: "bag-1",
  variantId: "ivory-1",
  productName: "Ivory Bag",
  sku: "BAG-1",
  color: "Ivory",
  size: "One Size",
  quantity: 1,
  placedAt: "2026-09-23T10:00:00Z",
  existingReview: null,
};
let container: HTMLDivElement, root: Root;
beforeEach(async () => {
  vi.resetAllMocks();
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<ReviewForm item={item} />));
  container.querySelector<HTMLTextAreaElement>(
    'textarea[name="content"]',
  )!.value = "Lovely finish and plenty of room inside.";
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function submit() {
  await act(async () => {
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

describe("product review submission", () => {
  it("prevents native submission before hydration and never uses GET for review content", () => {
    const html = renderToStaticMarkup(<ReviewForm item={item} />);
    const template = document.createElement("template");
    template.innerHTML = html;
    expect(template.content.querySelector("form")!.method).toBe("post");
    expect(template.content.querySelector("fieldset")!.disabled).toBe(true);
    expect(template.content.querySelector("button")!.disabled).toBe(true);
  });
  it("saves once, resets the form after the async response, and shows success", async () => {
    let resolve!: (value: unknown) => void;
    mocks.command.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await submit();
    await submit();
    expect(mocks.command).toHaveBeenCalledTimes(1);
    expect(container.querySelector("button")!.disabled).toBe(true);
    expect(mocks.command).toHaveBeenCalledWith("createReview", {
      orderId: "order-1",
      productId: "bag-1",
      variantId: "ivory-1",
      rating: 5,
      title: null,
      content: "Lovely finish and plenty of room inside.",
      images: [],
    });
    await act(async () => resolve({ ok: true }));
    expect(container.textContent).toContain("Review submitted for moderation.");
    expect(container.querySelector("textarea")!.value).toBe("");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("preserves the review text after a failure so the customer can retry", async () => {
    mocks.command.mockRejectedValueOnce(
      new Error("Connection interrupted. Please retry."),
    );
    await submit();
    expect(container.textContent).toContain(
      "Connection interrupted. Please retry.",
    );
    expect(container.querySelector("textarea")!.value).toContain(
      "Lovely finish",
    );
    expect(container.querySelector("button")!.disabled).toBe(false);
    mocks.command.mockResolvedValueOnce({ ok: true });
    await submit();
    expect(mocks.command).toHaveBeenCalledTimes(2);
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
});
