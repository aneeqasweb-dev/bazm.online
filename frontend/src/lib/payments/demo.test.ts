import { describe, expect, it } from "vitest";
import { validateDemoPayment } from "./demo";
const now = new Date(2026, 8, 22);
const values = {
  cardHolder: "Demo Shopper",
  cardNumber: "4242 4242 4242 4242",
  cardExpiry: "09/26",
  cardCvv: "123",
};
function form(input: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(input)) data.set(key, value);
  return data;
}
describe("demo payment validation", () => {
  it.each(["EASYPAISA", "JAZZCASH"] as const)(
    "validates %s mobile numbers",
    (method) => {
      expect(
        validateDemoPayment(
          method,
          form({ paymentMobile: "0300 1234567" }),
          now,
        ),
      ).toEqual({});
      expect(
        validateDemoPayment(
          method,
          form({ paymentMobile: "+923001234567" }),
          now,
        ),
      ).toEqual({});
      expect(
        validateDemoPayment(method, form({ paymentMobile: "12345" }), now),
      ).toHaveProperty("paymentMobile");
    },
  );
  it("accepts a valid card expiring in the current month", () =>
    expect(validateDemoPayment("CARD", form(values), now)).toEqual({}));
  it.each([
    ["cardHolder", "A"],
    ["cardNumber", "4242 4242 4242 4241"],
    ["cardNumber", "0000000000000000"],
    ["cardExpiry", "08/26"],
    ["cardExpiry", "13/28"],
    ["cardExpiry", "12/25"],
    ["cardCvv", "12"],
    ["cardCvv", "abc"],
  ])("rejects invalid %s=%s", (key, value) =>
    expect(
      validateDemoPayment("CARD", form({ ...values, [key]: value }), now),
    ).toHaveProperty(key),
  );
});
