import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  command: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock("@/lib/commands/client", () => ({ callCommand: mocks.command }));
import { CartButton } from "./cart-button";

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
async function render(disabled = false) {
  await act(async () =>
    root.render(
      <CartButton
        productId="shirt"
        variantId="blue-l"
        quantity={3}
        disabled={disabled}
      />,
    ),
  );
}
function button(index: number) {
  return container.querySelectorAll("button")[index]!;
}

describe("product purchase actions", () => {
  it.each([
    [0, "/cart"],
    [1, "/checkout"],
  ] as const)(
    "saves the selected variant and quantity before action %s navigates",
    async (index, destination) => {
      let done!: (value: unknown) => void;
      mocks.command.mockImplementation(
        () =>
          new Promise((resolve) => {
            done = resolve;
          }),
      );
      await render();
      await act(async () => {
        button(index).click();
        button(1 - index).click();
      });
      expect(mocks.command).toHaveBeenCalledExactlyOnceWith("addCartItem", {
        productId: "shirt",
        variantId: "blue-l",
        quantity: 3,
      });
      expect(mocks.push).not.toHaveBeenCalled();
      expect(button(0).disabled && button(1).disabled).toBe(true);
      await act(async () => done({ ok: true }));
      expect(mocks.push).toHaveBeenCalledWith(destination);
      expect(mocks.refresh).toHaveBeenCalledOnce();
    },
  );
  it("keeps the customer on the product when saving fails and permits retry", async () => {
    mocks.command
      .mockRejectedValueOnce(new Error("Only 2 are available."))
      .mockResolvedValueOnce({ ok: true });
    await render();
    await act(async () => button(1).click());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Only 2 are available.",
    );
    expect(mocks.push).not.toHaveBeenCalled();
    await act(async () => button(1).click());
    expect(mocks.push).toHaveBeenCalledWith("/checkout");
  });
  it("disables both purchase options for an unavailable variant", async () => {
    await render(true);
    await act(async () => {
      button(0).click();
      button(1).click();
    });
    expect(mocks.command).not.toHaveBeenCalled();
  });
});
