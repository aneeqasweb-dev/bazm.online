# Performance budgets

Phase 17 uses these budgets for repeatable checks on production builds and
emulator-rendered pages.

## Core Web Vitals targets

| Profile |     LCP |      INP |   CLS |    TTFB |
| ------- | ------: | -------: | ----: | ------: |
| Mobile  | ≤ 2.5 s | ≤ 200 ms | ≤ 0.1 | ≤ 1.2 s |
| Desktop | ≤ 1.8 s | ≤ 200 ms | ≤ 0.1 | ≤ 0.8 s |

## Route budgets

| Route                | First-load JS gzip |     HTML | Server response | Firestore document-read budget | Notes                                                                                                            |
| -------------------- | -----------------: | -------: | --------------: | -----------------------------: | ---------------------------------------------------------------------------------------------------------------- |
| `/`                  |           ≤ 160 KB | ≤ 180 KB |         ≤ 4.5 s |                           ≤ 80 | Public home should not load Firebase client JS.                                                                  |
| `/shop`              |           ≤ 160 KB | ≤ 220 KB |         ≤ 4.5 s |                          ≤ 260 | Search is bounded to the catalog scan window plus category filter options.                                       |
| `/[...categoryPath]` |           ≤ 160 KB | ≤ 220 KB |         ≤ 4.5 s |                          ≤ 160 | Category tree/products are bounded and route-registry checked.                                                   |
| `/product/[slug]`    |           ≤ 420 KB | ≤ 260 KB |         ≤ 5.0 s |                          ≤ 180 | Approved exception: product purchase actions need Firebase callable client code; action buttons are lazy-loaded. |
| `/cart`              |           ≤ 420 KB | ≤ 240 KB |         ≤ 5.0 s |                           ≤ 60 | Approved exception: authenticated cart actions need Firebase callable client code.                               |
| `/checkout`          |           ≤ 420 KB | ≤ 260 KB |         ≤ 5.0 s |                           ≤ 30 | Approved exception: authenticated checkout actions need Firebase callable client code.                           |
| `/admin`             |           ≤ 420 KB | ≤ 320 KB |         ≤ 5.5 s |                          ≤ 650 | Approved exception: admin shell needs Firebase action code and bounded dashboard samples.                        |

The machine-readable copy lives in
[`docs/performance-budgets.json`](./performance-budgets.json), and the Phase 17
emulator test reads that file directly.

## Repeatable measurement commands

Run the static and build gates:

```bash
npm run check
```

Run the focused Phase 17 performance gate:

```bash
npm run build
CHOKIDAR_USEPOLLING=true CHOKIDAR_INTERVAL=500 npx --yes firebase-tools@latest emulators:exec --project demo-bazm-online --only auth,firestore,functions,storage "node tests/phase-17-performance-flow.mjs"
```

Run the full integrated gate:

```bash
DEBUG= npm run test:emulators
```

Inspect the latest route bundle stats after a frontend build:

```bash
node tests/phase-17-performance-flow.mjs --bundle-only
```
