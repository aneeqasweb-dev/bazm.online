import { describe, expect, it } from "vitest";

import {
  EMAIL_TEMPLATE_KEYS,
  renderAllTemplatePreviews,
  renderEmailTemplate,
} from "./templates.js";

describe("email templates", () => {
  it("renders an accessible local preview for every transactional template", () => {
    const previews = renderAllTemplatePreviews();

    expect(previews).toHaveLength(EMAIL_TEMPLATE_KEYS.length);
    for (const preview of previews) {
      expect(preview.message.subject.length).toBeGreaterThan(6);
      expect(preview.message.previewText.length).toBeGreaterThan(12);
      expect(preview.message.textBody).toContain("Bazm");
      expect(preview.message.htmlBody).toContain("<!doctype html>");
      expect(preview.message.htmlBody).toContain('<html lang="en">');
      expect(preview.message.htmlBody).toContain('role="article"');
      expect(preview.message.htmlBody).toContain("<h1");
      expect(preview.message.htmlBody).toContain("href=");
    }
  });

  it("escapes customer-controlled values before rendering html", () => {
    const message = renderEmailTemplate("WELCOME", {
      customerName: 'Aneeqa <script>alert("x")</script>',
      accountUrl: "https://bazm.online/account",
    });

    expect(message.htmlBody).toContain(
      "Aneeqa &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
    expect(message.htmlBody).not.toContain("<script>");
  });
});
