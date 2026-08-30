import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const projectId = "demo-bazm-online";
const appOrigin = "http://127.0.0.1:3116";
const canonicalOrigin = "https://bazm.online";
const suffix = Date.now().toString();
const botHeaders = { "user-agent": "Googlebot" };

const app = getApps()[0] ?? initializeApp({ projectId });
const firestore = getFirestore(app);

function storageUrl(path) {
  return `http://127.0.0.1:9199/v0/b/${projectId}.appspot.com/o/${encodeURIComponent(
    path,
  )}?alt=media`;
}

function mediaAsset(path, alt) {
  return {
    alt,
    contentHash: `phase16hash${suffix}${path.length}`,
    contentType: "image/webp",
    height: 1500,
    path,
    sortOrder: 0,
    url: storageUrl(path),
    width: 1200,
  };
}

function stamp(now = Timestamp.now()) {
  return {
    createdAt: now,
    schemaVersion: 1,
    updatedAt: now,
  };
}

async function registerSlug(type, slug, ownerId, now) {
  await firestore
    .collection("slugRegistry")
    .doc(`${type.toLowerCase()}_${slug}`)
    .set({
      createdAt: now,
      ownerId,
      slug,
      type,
    });
}

async function seedSeoCatalog() {
  const now = Timestamp.now();
  const rootCategoryId = `p16-root-${suffix}`;
  const childCategoryId = `p16-child-${suffix}`;
  const inactiveCategoryId = `p16-inactive-${suffix}`;
  const productId = `p16-product-${suffix}`;
  const draftProductId = `p16-draft-${suffix}`;
  const variantId = `p16-variant-${suffix}`;
  const rootSlug = `phase-sixteen-women-${suffix}`;
  const childSlug = `phase-sixteen-kurtas-${suffix}`;
  const inactiveSlug = `phase-sixteen-inactive-${suffix}`;
  const productSlug = `phase-sixteen-kurta-${suffix}`;
  const draftSlug = `phase-sixteen-draft-${suffix}`;

  await Promise.all([
    firestore
      .collection("categories")
      .doc(rootCategoryId)
      .set({
        archivedAt: null,
        depth: 0,
        image: mediaAsset(
          `categories/phase-16-${suffix}/women.webp`,
          "Phase sixteen women collection",
        ),
        name: "Phase Sixteen Women",
        parentId: null,
        seo: {
          description:
            "Explore the Phase Sixteen women collection used for SEO verification.",
          title: "Phase Sixteen Women Collection",
        },
        slug: rootSlug,
        sortOrder: 0,
        status: "ACTIVE",
        ...stamp(now),
      }),
    firestore
      .collection("categories")
      .doc(childCategoryId)
      .set({
        archivedAt: null,
        depth: 1,
        image: mediaAsset(
          `categories/phase-16-${suffix}/kurtas.webp`,
          "Phase sixteen kurtas collection",
        ),
        name: "Phase Sixteen Kurtas",
        parentId: rootCategoryId,
        seo: {
          description:
            "Browse the Phase Sixteen kurtas collection used for SEO metadata validation.",
          title: "Phase Sixteen Kurtas Collection",
        },
        slug: childSlug,
        sortOrder: 0,
        status: "ACTIVE",
        ...stamp(now),
      }),
    firestore
      .collection("categories")
      .doc(inactiveCategoryId)
      .set({
        archivedAt: null,
        depth: 0,
        image: null,
        name: "Phase Sixteen Inactive",
        parentId: null,
        seo: { description: null, title: null },
        slug: inactiveSlug,
        sortOrder: 1,
        status: "ARCHIVED",
        ...stamp(now),
      }),
  ]);

  await Promise.all([
    registerSlug("CATEGORY", rootSlug, rootCategoryId, now),
    registerSlug("CATEGORY", childSlug, childCategoryId, now),
    registerSlug("CATEGORY", inactiveSlug, inactiveCategoryId, now),
  ]);

  const product = {
    archivedAt: null,
    basePrice: { amountMinor: 185_000, currency: "PKR" },
    brand: "Bazm",
    categoryId: childCategoryId,
    categoryPath: [rootCategoryId, childCategoryId],
    description:
      "A visible Phase Sixteen kurta used to verify product metadata, Product JSON-LD, canonical URLs, social tags, and sitemap coverage.",
    flags: { featured: true, newArrival: true },
    media: [
      mediaAsset(
        `products/phase-16-${suffix}/primary.webp`,
        "Phase sixteen embroidered kurta",
      ),
    ],
    name: "Phase Sixteen SEO Kurta",
    publishedAt: now,
    ratingSummary: { average: 4.7, count: 4 },
    searchTokens: ["phase", "sixteen", "seo", "kurta", "bazm"],
    seo: {
      description:
        "Shop the Phase Sixteen SEO Kurta at Bazm with verified metadata and structured data.",
      title: "Phase Sixteen SEO Kurta",
    },
    slug: productSlug,
    status: "PUBLISHED",
    tags: ["phase-sixteen", "kurta"],
    ...stamp(now),
  };

  await Promise.all([
    firestore.collection("products").doc(productId).set(product),
    firestore
      .collection("products")
      .doc(productId)
      .collection("variants")
      .doc(variantId)
      .set({
        color: "Ivory",
        isActive: true,
        media: [],
        priceOverride: null,
        productId,
        size: "M",
        sku: `P16-SKU-${suffix}`,
        ...stamp(now),
      }),
    firestore
      .collection("products")
      .doc(draftProductId)
      .set({
        ...product,
        flags: { featured: false, newArrival: false },
        name: "Phase Sixteen Draft Kurta",
        ratingSummary: { average: 0, count: 0 },
        seo: { description: null, title: null },
        slug: draftSlug,
        status: "DRAFT",
      }),
    registerSlug("PRODUCT", productSlug, productId, now),
    registerSlug("PRODUCT", draftSlug, draftProductId, now),
  ]);

  return {
    childPath: `/${rootSlug}/${childSlug}`,
    draftSlug,
    inactivePath: `/${inactiveSlug}`,
    productPath: `/product/${productSlug}`,
    rootPath: `/${rootSlug}`,
  };
}

function decodeEntities(value) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function metaContent(html, name) {
  const tag = (html.match(/<meta\b[^>]*>/g) ?? []).find(
    (candidate) =>
      candidate.includes(`name="${name}"`) ||
      candidate.includes(`property="${name}"`),
  );
  assert.ok(tag, `Missing meta tag ${name}`);
  const content = tag.match(/\scontent="([^"]*)"/)?.[1];
  assert.ok(content, `Missing content for meta tag ${name}`);
  return decodeEntities(content);
}

function titleText(html) {
  const title = html.match(/<title>([^<]*)<\/title>/i)?.[1];
  assert.ok(title, "Missing title tag");
  return decodeEntities(title);
}

function canonicalHref(html) {
  const tag = (html.match(/<link\b[^>]*>/g) ?? []).find((candidate) =>
    candidate.includes('rel="canonical"'),
  );
  assert.ok(tag, "Missing canonical link");
  const href = tag.match(/\shref="([^"]*)"/)?.[1];
  assert.ok(href, "Missing canonical href");
  return decodeEntities(href);
}

function jsonLdBlocks(html) {
  return [
    ...html.matchAll(
      /<script\b(?=[^>]*type="application\/ld\+json")[^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ].map((match) => JSON.parse(match[1]));
}

function findJsonLd(html, type) {
  const match = jsonLdBlocks(html).find((block) => block["@type"] === type);
  assert.ok(match, `Missing ${type} JSON-LD`);
  return match;
}

async function fetchHtml(path) {
  const response = await fetch(`${appOrigin}${path}`, {
    headers: botHeaders,
  });
  const html = await response.text();
  assert.ok(response.ok, `${path} returned ${response.status}: ${html}`);
  return html;
}

async function waitForNextServer(server) {
  let serverOutput = "";
  server.stdout.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`${appOrigin}/shop`, {
        headers: botHeaders,
      });
      if (response.ok) return;
    } catch {
      // The production server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Next.js server did not start. ${serverOutput}`);
}

async function stopNextServer(server) {
  const stopped = new Promise((resolve) => server.once("exit", resolve));
  server.kill("SIGTERM");
  await Promise.race([
    stopped,
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (server.exitCode === null && server.signalCode === null) {
    server.kill("SIGKILL");
    await stopped;
  }
}

function publicInternalLinks(html) {
  const blockedPrefixes = [
    "/account",
    "/admin",
    "/api",
    "/cart",
    "/checkout",
    "/forgot-password",
    "/login",
    "/register",
    "/reset-password",
    "/unauthorized",
    "/verify-email",
    "/wishlist",
  ];
  return [
    ...new Set(
      [...html.matchAll(/<a\b[^>]*\shref="([^"]*)"/g)]
        .map((match) => decodeEntities(match[1]))
        .filter((href) => href.startsWith("/") && !href.startsWith("//"))
        .filter((href) => {
          const path = href.split(/[?#]/)[0];
          return !blockedPrefixes.some(
            (prefix) => path === prefix || path.startsWith(`${prefix}/`),
          );
        }),
    ),
  ];
}

try {
  const routes = await seedSeoCatalog();
  const nextServer = spawn(
    process.execPath,
    [
      fileURLToPath(
        new URL("../node_modules/next/dist/bin/next", import.meta.url),
      ),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3116",
    ],
    {
      cwd: fileURLToPath(new URL("../frontend", import.meta.url)),
      env: {
        ...process.env,
        NEXT_PUBLIC_APP_URL: canonicalOrigin,
        NEXT_PUBLIC_USE_FIREBASE_EMULATORS: "true",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  try {
    await waitForNextServer(nextServer);

    const [homeHtml, shopHtml, filteredShopHtml, categoryHtml, productHtml] =
      await Promise.all([
        fetchHtml("/"),
        fetchHtml("/shop"),
        fetchHtml("/shop?q=phase-sixteen"),
        fetchHtml(routes.childPath),
        fetchHtml(routes.productPath),
      ]);

    assert.match(titleText(homeHtml), /Bazm — Contemporary Fashion Pakistan/);
    assert.ok(
      [canonicalOrigin, `${canonicalOrigin}/`].includes(
        canonicalHref(homeHtml),
      ),
      "Home canonical should resolve to the site root",
    );
    assert.match(metaContent(homeHtml, "og:title"), /Bazm/);
    assert.equal(metaContent(homeHtml, "twitter:card"), "summary");
    assert.equal(findJsonLd(homeHtml, "Organization").name, "Bazm");
    assert.equal(findJsonLd(homeHtml, "WebSite").name, "Bazm");

    assert.match(titleText(shopHtml), /Shop contemporary fashion/);
    assert.equal(canonicalHref(shopHtml), `${canonicalOrigin}/shop`);
    assert.match(metaContent(shopHtml, "robots"), /index, follow/);
    assert.equal(canonicalHref(filteredShopHtml), `${canonicalOrigin}/shop`);
    assert.match(metaContent(filteredShopHtml, "robots"), /noindex, follow/);

    assert.match(titleText(categoryHtml), /Phase Sixteen Kurtas Collection/);
    assert.equal(
      canonicalHref(categoryHtml),
      `${canonicalOrigin}${routes.childPath}`,
    );
    assert.match(metaContent(categoryHtml, "og:title"), /Phase Sixteen/);
    const categoryBreadcrumb = findJsonLd(categoryHtml, "BreadcrumbList");
    assert.equal(
      categoryBreadcrumb.itemListElement.at(-1).name,
      "Phase Sixteen Kurtas",
    );

    assert.match(titleText(productHtml), /Phase Sixteen SEO Kurta/);
    assert.equal(
      canonicalHref(productHtml),
      `${canonicalOrigin}${routes.productPath}`,
    );
    assert.equal(
      metaContent(productHtml, "twitter:card"),
      "summary_large_image",
    );
    assert.match(
      metaContent(productHtml, "og:title"),
      /Phase Sixteen SEO Kurta/,
    );
    const productData = findJsonLd(productHtml, "Product");
    assert.equal(productData.name, "Phase Sixteen SEO Kurta");
    assert.equal(productData.offers.priceCurrency, "PKR");
    assert.equal(productData.offers.availability, "https://schema.org/InStock");
    assert.equal(productData.aggregateRating.reviewCount, 4);
    const productBreadcrumb = jsonLdBlocks(productHtml).find(
      (block) => block["@type"] === "BreadcrumbList",
    );
    assert.ok(productBreadcrumb, "Product page is missing breadcrumb JSON-LD");
    assert.equal(
      productBreadcrumb.itemListElement.at(-1).name,
      "Phase Sixteen SEO Kurta",
    );

    const duplicateProductHtml = await fetchHtml(
      `${routes.productPath}?reviewsAfter=missing-review`,
    );
    assert.equal(
      canonicalHref(duplicateProductHtml),
      `${canonicalOrigin}${routes.productPath}`,
    );
    assert.match(
      metaContent(duplicateProductHtml, "robots"),
      /noindex, follow/,
    );

    const sitemapResponse = await fetch(`${appOrigin}/sitemap.xml`, {
      headers: botHeaders,
    });
    const sitemapXml = await sitemapResponse.text();
    assert.ok(sitemapResponse.ok, `Sitemap failed: ${sitemapXml}`);
    assert.match(sitemapXml, /<urlset[\s>]/);
    const sitemapLocs = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      (match) => match[1],
    );
    assert.ok(
      sitemapLocs.includes(canonicalOrigin) ||
        sitemapLocs.includes(`${canonicalOrigin}/`),
      "Home missing from sitemap",
    );
    assert.ok(
      sitemapLocs.includes(`${canonicalOrigin}/shop`),
      "Shop missing from sitemap",
    );
    assert.ok(
      sitemapLocs.includes(`${canonicalOrigin}${routes.rootPath}`),
      "Root category missing from sitemap",
    );
    assert.ok(
      sitemapLocs.includes(`${canonicalOrigin}${routes.childPath}`),
      "Child category missing from sitemap",
    );
    assert.ok(
      sitemapLocs.includes(`${canonicalOrigin}${routes.productPath}`),
      "Published product missing from sitemap",
    );
    assert.ok(
      !sitemapXml.includes(routes.inactivePath.slice(1)),
      "Inactive category leaked into sitemap",
    );
    assert.ok(
      !sitemapXml.includes(routes.draftSlug),
      "Draft product leaked into sitemap",
    );
    assert.equal(new Set(sitemapLocs).size, sitemapLocs.length);
    assert.ok(
      sitemapLocs.every(
        (loc) => loc.startsWith(canonicalOrigin) && !loc.includes("?"),
      ),
      "Sitemap contains non-canonical or query URLs",
    );

    const robotsResponse = await fetch(`${appOrigin}/robots.txt`, {
      headers: botHeaders,
    });
    const robotsText = await robotsResponse.text();
    assert.ok(robotsResponse.ok, `Robots failed: ${robotsText}`);
    assert.match(robotsText, /User-Agent:\s*\*/i);
    assert.match(robotsText, /Disallow:\s*\//i);
    assert.match(
      robotsText,
      new RegExp(`Sitemap:\\s*${canonicalOrigin}/sitemap\\.xml`, "i"),
    );

    for (const path of [routes.inactivePath, `/product/${routes.draftSlug}`]) {
      const response = await fetch(`${appOrigin}${path}`, {
        headers: botHeaders,
      });
      assert.equal(response.status, 404, `${path} should stay non-public`);
    }

    const crawlQueue = new Set([
      "/",
      "/shop",
      "/shop?q=women",
      routes.rootPath,
      routes.childPath,
      routes.productPath,
    ]);
    for (const html of [homeHtml, shopHtml, categoryHtml, productHtml]) {
      for (const href of publicInternalLinks(html)) crawlQueue.add(href);
    }
    for (const href of crawlQueue) {
      const response = await fetch(`${appOrigin}${href}`, {
        headers: botHeaders,
      });
      assert.ok(
        response.status < 400,
        `Public internal link ${href} returned ${response.status}`,
      );
    }
  } finally {
    await stopNextServer(nextServer);
  }

  console.log(
    "Phase 16 SEO flow passed metadata, canonical, robots, sitemap, JSON-LD, crawl, and non-public URL checks.",
  );
} finally {
  await deleteApp(app).catch(() => undefined);
}
