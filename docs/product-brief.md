# Bazm product and brand brief

Status: working baseline adopted 2026-08-29. Business assumptions can change by
an architecture decision record without blocking engineering foundations.

## Product

Bazm is a curated, Pakistan-first fashion store for women and men, including
occasion wear, bags and a small accessories edit. The owner confirmed on
2026-09-16 that the cream-and-olive fashion design should be retained, with more
fashion pieces and without kids or general-store departments. The follow-up
correction restricts the visible catalog to Women, Men, Bags and Accessories,
removes the short frock-style sample dresses and shoes, and keeps the original
Pakistani women’s ensembles.
The name means a gathering: the experience should feel considered, social, and
editorial rather than like a dense discount warehouse.

- Audience: digitally active customers in Pakistan, initially shipping within
  Pakistan only.
- Currency: PKR, stored as integer minor units; display normally has zero decimal
  places while the money primitive remains minor-unit safe.
- Language: English at MVP; Urdu is a planned localization, not mixed ad-hoc into
  English UI.
- Time: store timestamps in UTC; display business times in `Asia/Karachi`.
- Tone: warm, concise, assured, inclusive, and never urgency-manipulative.
- Visual direction: cream neutrals, restrained olive accents, generous space,
  editorial typography, product imagery with consistent lighting.

## Originality and assets

Bazm does not copy SHEIN or another marketplace's branding, layout, copy,
photography, icons, taxonomy, or proprietary interaction patterns. Inspiration is
limited to general e-commerce capabilities. Use only commissioned, licensed,
public-domain, or internally generated assets with provenance recorded. Product
photos require supplier permission and accurate alt text.

## MVP catalog

| Department | Initial categories                   | Representative item                 |
| ---------- | ------------------------------------ | ----------------------------------- |
| Women      | Dresses, Tops, Jeans, Accessories    | Linen midi dress: black/sand; XS–XL |
| Men        | Shirts, T-Shirts, Jeans, Accessories | Oxford shirt: white/blue; S–XXL     |

Every sellable combination is a variant with a unique SKU, for example
`W-DRS-LIN-BLK-M`. Color and size are presentation attributes; the SKU is the
inventory identity.

## Pakistan operating assumptions

- Prices are tax-inclusive until a tax adviser specifies a different policy.
- Standard and express delivery are modeled; fees remain configurable.
- Cash on delivery may be offered behind the payment-provider abstraction but is
  not assumed available for every postal code or order value.
- The initial return window is a configurable 14 calendar days after delivery.
- Unworn condition, tags, hygiene exclusions, reverse-shipping fees, and refund
  timing must be finalized before checkout is released.
- Address model supports Pakistani province/territory, city, area, postal code,
  phone, and delivery instructions; no CNIC is collected for ordinary orders.

## Decisions still owned by the business

| Decision                                         | Owner                        | Needed by      | Default while open                   |
| ------------------------------------------------ | ---------------------------- | -------------- | ------------------------------------ |
| Legal entity, tax treatment, and invoice wording | Product owner + accountant   | Checkout       | Tax-inclusive display, no tax claims |
| Courier contracts and serviceable areas          | Operations owner             | Checkout       | Configurable flat-rate mock adapter  |
| Payment/COD eligibility and limits               | Product owner + provider     | Payments       | Provider-neutral sandbox adapter     |
| Final return/hygiene policy                      | Product owner + legal review | Returns        | Configurable 14-day baseline         |
| Licensed product photography                     | Catalog owner                | Product launch | Development placeholders only        |

These choices do not block repository, authentication, schema, or emulator work;
they block production activation of their respective workflows.
