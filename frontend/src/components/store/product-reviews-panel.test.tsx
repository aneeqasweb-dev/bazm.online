import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ push: vi.fn(), command: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/lib/commands/client", () => ({ callCommand: mocks.command }));
import { ProductReviewsPanel } from "./product-reviews-panel";
import { ProductQuestionForm } from "./product-question-form";

const summary = {
  count: 12,
  average: 4.25,
  distribution: [5, 4, 3, 2, 1].map((rating) => ({
    rating,
    count: rating === 5 ? 9 : rating === 2 ? 3 : 0,
  })),
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
async function panel(access: "customer" | "guest" = "guest") {
  await act(async () =>
    root.render(
      <ProductReviewsPanel
        productSlug="ivory-bag"
        productName="Ivory Bag"
        summary={summary}
        sort="highest"
        access={access}
      >
        <p>Published customer review</p>
      </ProductReviewsPanel>,
    ),
  );
}
async function submit() {
  await act(async () => {
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

describe("product review section", () => {
  it("shows the full summary and uses keyboard-accessible review/question tabs", async () => {
    await panel();
    expect(container.textContent).toContain("Based on 12 reviews");
    expect(
      container.querySelector('[aria-label="5 stars: 9 reviews"]'),
    ).not.toBeNull();
    const tabs = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    await act(async () => {
      tabs[0].dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      );
    });
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tabs[1]);
    expect(container.querySelector<HTMLElement>("#reviews-panel")!.hidden).toBe(
      true,
    );
    const link =
      container.querySelector<HTMLAnchorElement>("#questions-panel a")!;
    expect(link.getAttribute("href")).toBe(
      "/login?next=%2Fproduct%2Fivory-bag%3FreviewTab%3Dquestions%23reviews",
    );
  });
  it("changes server-side sort and starts at its first page", async () => {
    await panel();
    const select = container.querySelector("select")!;
    await act(async () => {
      select.value = "lowest";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(mocks.push).toHaveBeenCalledWith(
      "/product/ivory-bag?reviewSort=lowest#reviews",
      { scroll: false },
    );
  });
  it("disables native question submission before hydration", () => {
    const html = renderToStaticMarkup(
      <ProductQuestionForm
        productSlug="ivory-bag"
        productName="Ivory Bag"
        access="customer"
      />,
    );
    const template = document.createElement("template");
    template.innerHTML = html;
    expect(template.content.querySelector("form")!.method).toBe("post");
    expect(template.content.querySelector("fieldset")!.disabled).toBe(true);
  });
  it("sends the product context once and confirms the private support conversation", async () => {
    await panel("customer");
    let resolve!: (value: unknown) => void;
    mocks.command.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    container.querySelector("textarea")!.value =
      "Can this bag fit a small tablet?";
    await submit();
    await submit();
    expect(mocks.command).toHaveBeenCalledTimes(1);
    expect(mocks.command).toHaveBeenCalledWith("createSupportTicket", {
      subject: "Product question: Ivory Bag",
      message:
        "Product: Ivory Bag\n/product/ivory-bag\n\nCan this bag fit a small tablet?",
      relatedOrderId: null,
    });
    await act(async () => resolve({ ok: true }));
    expect(container.textContent).toContain("Your question has been sent");
  });
  it("validates questions and preserves text when sending fails", async () => {
    await panel("customer");
    await submit();
    expect(mocks.command).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Enter a question between");
    const textarea = container.querySelector("textarea")!;
    textarea.value = "Is the strap adjustable for this bag?";
    mocks.command.mockRejectedValueOnce(
      new Error("Connection interrupted. Please retry."),
    );
    await submit();
    expect(container.textContent).toContain("Connection interrupted");
    expect(textarea.value).toBe("Is the strap adjustable for this bag?");
    mocks.command.mockResolvedValueOnce({ ok: true });
    await submit();
    expect(container.textContent).toContain("Your question has been sent");
  });
});
