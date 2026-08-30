import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";

const projectId = "demo-bazm-online";
const apiKey = "demo-api-key";
const authOrigin = "http://127.0.0.1:9099";
const functionsOrigin = `http://127.0.0.1:5001/${projectId}/asia-south1`;
const appOrigin = "http://127.0.0.1:3101";
const suffix = Date.now().toString();
const password = "Secure123";

const app = getApps()[0] ?? initializeApp({ projectId });
const auth = getAuth(app);
const firestore = getFirestore(app);

async function authRequest(endpoint, body) {
  const response = await fetch(
    `${authOrigin}/identitytoolkit.googleapis.com/v1/${endpoint}?key=${apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return { response, data: await response.json() };
}

async function refreshToken(refreshToken) {
  const response = await fetch(
    `${authOrigin}/securetoken.googleapis.com/v1/token?key=${apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    },
  );
  const data = await response.json();
  assert.ok(response.ok && data.id_token, "Token refresh failed");
  return data.id_token;
}

async function call(name, idToken, data = {}) {
  const response = await fetch(`${functionsOrigin}/${name}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${idToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ data }),
  });
  return { response, data: await response.json() };
}

async function account(role, label, permissions = []) {
  const email = `phase-14-${label}-${suffix}@example.test`;
  const signUp = await authRequest("accounts:signUp", {
    email,
    password,
    returnSecureToken: true,
  });
  assert.ok(signUp.response.ok && signUp.data.idToken && signUp.data.localId);
  const registration = await call("completeRegistration", signUp.data.idToken, {
    name: `Phase Fourteen ${label}`,
  });
  assert.ok(registration.response.ok, `${label} registration failed`);
  await Promise.all([
    auth.updateUser(signUp.data.localId, { emailVerified: true }),
    firestore.collection("users").doc(signUp.data.localId).update({
      emailVerified: true,
      role,
      isActive: true,
      permissions,
      updatedAt: FieldValue.serverTimestamp(),
    }),
  ]);
  await auth.setCustomUserClaims(signUp.data.localId, {
    role,
    isActive: true,
    claimsVersion: 1,
    ...(permissions.length ? { permissions } : {}),
  });
  return {
    email,
    refreshToken: signUp.data.refreshToken,
    token: await refreshToken(signUp.data.refreshToken),
    uid: signUp.data.localId,
  };
}

function storageUrl(path) {
  return `http://127.0.0.1:9199/v0/b/${projectId}.appspot.com/o/${encodeURIComponent(
    path,
  )}?alt=media`;
}

function mediaAsset(path, alt = "Phase fourteen product image") {
  return {
    path,
    url: storageUrl(path),
    alt,
    width: 1200,
    height: 1500,
    contentType: "image/webp",
    contentHash: `phase14hash${suffix}${path.length}`,
    sortOrder: 0,
  };
}

function reviewImage(userId) {
  return mediaAsset(
    `reviews/${userId}/review-${suffix}.webp`,
    "Customer review image",
  );
}

function address() {
  return {
    recipientName: "Phase Fourteen Customer",
    phone: "+923001234567",
    line1: "14 Review Road",
    line2: null,
    area: "Gulberg",
    city: "Lahore",
    province: "PUNJAB",
    postalCode: "54000",
    deliveryInstructions: null,
  };
}

function orderPayload({ orderId, productId, status, userId, variantId }) {
  const now = Timestamp.now();
  return {
    userId,
    status,
    items: [
      {
        productId,
        variantId,
        productName: "Phase Fourteen Kurta",
        sku: `P14-${suffix}`,
        color: "Ivory",
        size: "M",
        quantity: 1,
        unitPrice: { amountMinor: 85_000, currency: "PKR" },
        discountAmount: { amountMinor: 0, currency: "PKR" },
        taxAmount: { amountMinor: 0, currency: "PKR" },
        lineTotal: { amountMinor: 85_000, currency: "PKR" },
        media: mediaAsset(`products/phase-14-${suffix}/primary.webp`),
      },
    ],
    shippingAddress: address(),
    billingAddress: address(),
    totals: {
      subtotal: { amountMinor: 85_000, currency: "PKR" },
      discount: { amountMinor: 0, currency: "PKR" },
      shipping: { amountMinor: 0, currency: "PKR" },
      tax: { amountMinor: 0, currency: "PKR" },
      grandTotal: { amountMinor: 85_000, currency: "PKR" },
      currency: "PKR",
    },
    couponId: null,
    couponCode: null,
    paymentId: `p14-payment-${orderId}`,
    reservationId: null,
    checkoutIdempotencyKey: `p14-checkout-${orderId}`,
    paymentMethod: "CARD",
    trackingNumber: "TRK-P14",
    deliveryMethod: "STANDARD",
    policyVersion: "reviews-30-days-v1",
    customerNote: null,
    adminNote: null,
    placedAt: now,
    archivedAt: null,
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
  };
}

async function seedFixture(customer, other) {
  const now = Timestamp.now();
  const productId = `p14-product-${suffix}`;
  const variantId = `p14-variant-${suffix}`;
  const slug = `phase-fourteen-kurta-${suffix}`;
  const deliveredOrderId = `p14-delivered-${suffix}`;
  const prematureOrderId = `p14-premature-${suffix}`;
  const foreignOrderId = `p14-foreign-${suffix}`;
  const media = mediaAsset(`products/phase-14-${suffix}/primary.webp`);

  await firestore
    .collection("products")
    .doc(productId)
    .set({
      name: "Phase Fourteen Kurta",
      slug,
      description:
        "A verified review flow product used to test moderation and public pagination.",
      categoryId: `p14-category-${suffix}`,
      categoryPath: [`p14-category-${suffix}`],
      brand: "Bazm",
      basePrice: { amountMinor: 85_000, currency: "PKR" },
      media: [media],
      tags: ["phase-fourteen"],
      searchTokens: ["phase", "fourteen", "kurta", "bazm"],
      ratingSummary: { average: 0, count: 0 },
      flags: { featured: false, newArrival: true },
      seo: { title: null, description: null },
      status: "PUBLISHED",
      publishedAt: now,
      archivedAt: null,
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
    });
  await firestore
    .collection("products")
    .doc(productId)
    .collection("variants")
    .doc(variantId)
    .set({
      productId,
      sku: `P14-${suffix}`,
      color: "Ivory",
      size: "M",
      priceOverride: null,
      media: [],
      isActive: true,
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
    });
  await firestore.collection("slugRegistry").doc(`product_${slug}`).set({
    type: "PRODUCT",
    ownerId: productId,
    slug,
    createdAt: now,
  });
  await Promise.all([
    firestore
      .collection("orders")
      .doc(deliveredOrderId)
      .set(
        orderPayload({
          orderId: deliveredOrderId,
          productId,
          status: "DELIVERED",
          userId: customer.uid,
          variantId,
        }),
      ),
    firestore
      .collection("orders")
      .doc(prematureOrderId)
      .set(
        orderPayload({
          orderId: prematureOrderId,
          productId,
          status: "SHIPPED",
          userId: customer.uid,
          variantId,
        }),
      ),
    firestore
      .collection("orders")
      .doc(foreignOrderId)
      .set(
        orderPayload({
          orderId: foreignOrderId,
          productId,
          status: "DELIVERED",
          userId: other.uid,
          variantId,
        }),
      ),
  ]);
  return {
    deliveredOrderId,
    foreignOrderId,
    prematureOrderId,
    productId,
    slug,
    variantId,
  };
}

function reviewInput({ orderId, productId, userId, variantId }) {
  return {
    orderId,
    productId,
    variantId,
    rating: 4,
    title: "Beautiful tailoring",
    content:
      "The fabric, finishing, and delivery experience were all excellent.",
    images: [reviewImage(userId)],
  };
}

async function seedPublishedReview({
  content,
  createdAt,
  id,
  orderId,
  productId,
  rating = 5,
  userId,
  variantId,
}) {
  await firestore
    .collection("reviews")
    .doc(id)
    .set({
      productId,
      orderId,
      variantId,
      orderItemKey: `seeded-${id}`,
      userId,
      authorName: "Phase Fourteen Customer",
      rating,
      title: "Published review",
      content,
      images: [],
      status: "PUBLISHED",
      verifiedPurchase: true,
      moderationReason: null,
      editableUntil: Timestamp.fromMillis(Date.now() + 30 * 86_400_000),
      lastEditedAt: null,
      editCount: 0,
      reportedCount: 0,
      lastReportedAt: null,
      archivedAt: null,
      schemaVersion: 1,
      createdAt,
      updatedAt: createdAt,
    });
}

async function createSession(idToken) {
  const response = await fetch(`${appOrigin}/api/auth/session`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: appOrigin },
    body: JSON.stringify({ idToken }),
  });
  const sessionCookie = response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(response.ok && sessionCookie, "Web session failed");
  return sessionCookie;
}

async function waitForNextServer(server) {
  let serverOutput = "";
  server.stdout.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${appOrigin}/login`);
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

try {
  const [customer, other, admin] = await Promise.all([
    account("CUSTOMER", "customer"),
    account("CUSTOMER", "other"),
    account("ADMIN", "admin"),
  ]);
  const fixture = await seedFixture(customer, other);

  const nonPurchaser = await call(
    "createReview",
    customer.token,
    reviewInput({
      orderId: fixture.foreignOrderId,
      productId: fixture.productId,
      userId: customer.uid,
      variantId: fixture.variantId,
    }),
  );
  assert.equal(nonPurchaser.response.ok, false, "Non-purchaser reviewed order");

  const premature = await call(
    "createReview",
    customer.token,
    reviewInput({
      orderId: fixture.prematureOrderId,
      productId: fixture.productId,
      userId: customer.uid,
      variantId: fixture.variantId,
    }),
  );
  assert.equal(premature.response.ok, false, "Premature review succeeded");

  const wrongProduct = await call(
    "createReview",
    customer.token,
    reviewInput({
      orderId: fixture.deliveredOrderId,
      productId: `p14-wrong-product-${suffix}`,
      userId: customer.uid,
      variantId: fixture.variantId,
    }),
  );
  assert.equal(
    wrongProduct.response.ok,
    false,
    "Wrong product review succeeded",
  );

  const invalidImageOwner = await call("createReview", customer.token, {
    ...reviewInput({
      orderId: fixture.deliveredOrderId,
      productId: fixture.productId,
      userId: other.uid,
      variantId: fixture.variantId,
    }),
  });
  assert.equal(
    invalidImageOwner.response.ok,
    false,
    "Review accepted an image path owned by another user",
  );

  const created = await call(
    "createReview",
    customer.token,
    reviewInput({
      orderId: fixture.deliveredOrderId,
      productId: fixture.productId,
      userId: customer.uid,
      variantId: fixture.variantId,
    }),
  );
  assert.ok(
    created.response.ok && created.data.result?.id,
    JSON.stringify(created.data),
  );
  const reviewId = created.data.result.id;
  const reviewAfterCreate = await firestore
    .collection("reviews")
    .doc(reviewId)
    .get();
  assert.equal(reviewAfterCreate.get("status"), "PENDING");
  assert.equal(reviewAfterCreate.get("verifiedPurchase"), true);
  assert.equal(reviewAfterCreate.get("images").length, 1);
  assert.equal(
    (await firestore.collection("products").doc(fixture.productId).get()).get(
      "ratingSummary.count",
    ),
    0,
    "Pending reviews affected the aggregate",
  );

  const duplicate = await call(
    "createReview",
    customer.token,
    reviewInput({
      orderId: fixture.deliveredOrderId,
      productId: fixture.productId,
      userId: customer.uid,
      variantId: fixture.variantId,
    }),
  );
  assert.equal(duplicate.response.ok, false, "Duplicate review succeeded");

  const published = await call("moderateReview", admin.token, {
    reviewId,
    status: "PUBLISHED",
    moderationReason: null,
  });
  assert.ok(published.response.ok, "Review publish failed");
  let product = await firestore
    .collection("products")
    .doc(fixture.productId)
    .get();
  assert.equal(product.get("ratingSummary.count"), 1);
  assert.equal(product.get("ratingSummary.average"), 4);

  const edited = await call("updateReview", customer.token, {
    reviewId,
    input: {
      rating: 5,
      title: "Updated tailoring note",
      content:
        "Updated after wearing it twice: the finishing still feels excellent.",
    },
  });
  assert.ok(edited.response.ok, JSON.stringify(edited.data));
  const reviewAfterEdit = await firestore
    .collection("reviews")
    .doc(reviewId)
    .get();
  assert.equal(reviewAfterEdit.get("status"), "PENDING");
  assert.equal(reviewAfterEdit.get("rating"), 5);
  product = await firestore.collection("products").doc(fixture.productId).get();
  assert.equal(product.get("ratingSummary.count"), 0);

  const republished = await call("moderateReview", admin.token, {
    reviewId,
    status: "PUBLISHED",
    moderationReason: null,
  });
  assert.ok(republished.response.ok, "Review republish failed");
  product = await firestore.collection("products").doc(fixture.productId).get();
  assert.equal(product.get("ratingSummary.count"), 1);
  assert.equal(product.get("ratingSummary.average"), 5);

  const report = await call("reportReview", other.token, {
    reviewId,
    reason: "The review needs a moderator check.",
  });
  assert.ok(report.response.ok, JSON.stringify(report.data));
  assert.equal(
    (await firestore.collection("reviews").doc(reviewId).get()).get(
      "reportedCount",
    ),
    1,
  );
  const duplicateReport = await call("reportReview", other.token, {
    reviewId,
    reason: "Trying to report twice.",
  });
  assert.equal(
    duplicateReport.response.ok,
    false,
    "Duplicate report succeeded",
  );

  await firestore
    .collection("reviews")
    .doc(reviewId)
    .update({
      editableUntil: Timestamp.fromMillis(Date.now() - 60_000),
    });
  const expiredEdit = await call("updateReview", customer.token, {
    reviewId,
    input: { content: "This edit should be outside the owner edit window." },
  });
  assert.equal(expiredEdit.response.ok, false, "Expired owner edit succeeded");

  const hidden = await call("moderateReview", admin.token, {
    reviewId,
    status: "HIDDEN",
    moderationReason: "Hidden after customer report review.",
  });
  assert.ok(hidden.response.ok, "Review hide failed");
  product = await firestore.collection("products").doc(fixture.productId).get();
  assert.equal(product.get("ratingSummary.count"), 0);

  const now = Date.now();
  for (let index = 0; index < 6; index += 1) {
    await seedPublishedReview({
      id: `p14-public-${index}-${suffix}`,
      orderId: fixture.deliveredOrderId,
      productId: fixture.productId,
      userId: customer.uid,
      variantId: fixture.variantId,
      content: `Published pagination review ${index} for Phase 14.`,
      createdAt: Timestamp.fromMillis(now + index * 1_000),
      rating: index % 2 === 0 ? 5 : 4,
    });
  }
  await firestore
    .collection("reviews")
    .doc(`p14-pending-${suffix}`)
    .set({
      productId: fixture.productId,
      orderId: fixture.deliveredOrderId,
      variantId: fixture.variantId,
      orderItemKey: `pending-${suffix}`,
      userId: customer.uid,
      authorName: "Phase Fourteen Customer",
      rating: 5,
      title: "Pending phantom",
      content: "Pending phantom review must not render publicly.",
      images: [],
      status: "PENDING",
      verifiedPurchase: true,
      moderationReason: null,
      editableUntil: Timestamp.fromMillis(Date.now() + 30 * 86_400_000),
      lastEditedAt: null,
      editCount: 0,
      reportedCount: 0,
      lastReportedAt: null,
      archivedAt: null,
      schemaVersion: 1,
      createdAt: Timestamp.fromMillis(now + 10_000),
      updatedAt: Timestamp.fromMillis(now + 10_000),
    });
  await firestore
    .collection("reviews")
    .doc(`p14-rejected-${suffix}`)
    .set({
      productId: fixture.productId,
      orderId: fixture.deliveredOrderId,
      variantId: fixture.variantId,
      orderItemKey: `rejected-${suffix}`,
      userId: customer.uid,
      authorName: "Phase Fourteen Customer",
      rating: 5,
      title: "Rejected phantom",
      content: "Rejected phantom review must not render publicly.",
      images: [],
      status: "REJECTED",
      verifiedPurchase: true,
      moderationReason: "Rejected by moderator.",
      editableUntil: Timestamp.fromMillis(Date.now() + 30 * 86_400_000),
      lastEditedAt: null,
      editCount: 0,
      reportedCount: 0,
      lastReportedAt: null,
      archivedAt: null,
      schemaVersion: 1,
      createdAt: Timestamp.fromMillis(now + 11_000),
      updatedAt: Timestamp.fromMillis(now + 11_000),
    });
  await firestore
    .collection("products")
    .doc(fixture.productId)
    .update({
      ratingSummary: { average: 4.5, count: 6 },
      updatedAt: FieldValue.serverTimestamp(),
    });

  const publishedReviews = await firestore
    .collection("reviews")
    .where("productId", "==", fixture.productId)
    .where("status", "==", "PUBLISHED")
    .orderBy("createdAt", "desc")
    .limit(6)
    .get();
  assert.equal(publishedReviews.size, 6, "Published review fixture failed");
  const secondPageCursor = publishedReviews.docs.at(4)?.id;
  const secondPageMarker = publishedReviews.docs.at(5)?.get("content");
  assert.ok(secondPageCursor && secondPageMarker, "Review cursor missing");

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
      "3101",
    ],
    {
      cwd: fileURLToPath(new URL("../frontend", import.meta.url)),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  try {
    await waitForNextServer(nextServer);
    const [customerCookie, adminCookie] = await Promise.all([
      createSession(customer.token),
      createSession(admin.token),
    ]);

    const productResponse = await fetch(`${appOrigin}/product/${fixture.slug}`);
    const productHtml = await productResponse.text();
    assert.ok(
      productResponse.ok &&
        productHtml.includes("Customer reviews") &&
        productHtml.includes("Published pagination review") &&
        productHtml.includes("Next reviews page"),
      `Product review page did not render. Status ${
        productResponse.status
      }. Body: ${productHtml.slice(0, 800)}`,
    );
    assert.ok(
      !productHtml.includes("Pending phantom review") &&
        !productHtml.includes("Rejected phantom review"),
      "Unapproved reviews rendered publicly",
    );

    const secondPageResponse = await fetch(
      `${appOrigin}/product/${fixture.slug}?reviewsAfter=${encodeURIComponent(
        secondPageCursor,
      )}#reviews`,
    );
    const secondPageHtml = await secondPageResponse.text();
    assert.ok(
      secondPageResponse.ok && secondPageHtml.includes(secondPageMarker),
      "Review cursor page did not render the next public review",
    );

    const accountResponse = await fetch(`${appOrigin}/account`, {
      headers: { cookie: customerCookie },
    });
    const accountHtml = await accountResponse.text();
    assert.ok(
      accountResponse.ok &&
        accountHtml.includes("Review delivered items") &&
        accountHtml.includes("Phase Fourteen Kurta"),
      "Customer review center did not render delivered items",
    );

    const adminReviews = await fetch(
      `${appOrigin}/admin/reviews?q=${encodeURIComponent(reviewId)}`,
      { headers: { cookie: adminCookie } },
    );
    const adminReviewsHtml = await adminReviews.text();
    const adminReviewsText = adminReviewsHtml
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, 2_000);
    assert.ok(
      adminReviews.ok &&
        adminReviewsHtml.includes("1 customer report") &&
        adminReviewsHtml.includes("Hidden after customer report review."),
      `Reported review was not visible in the admin moderation queue. Status ${
        adminReviews.status
      }. hasReport=${adminReviewsHtml.includes(
        "1 customer report",
      )} hasReason=${adminReviewsHtml.includes(
        "Hidden after customer report review.",
      )} hasReviewId=${adminReviewsHtml.includes(
        reviewId,
      )} hasEmptyState=${adminReviewsHtml.includes(
        "No reviews in this page",
      )}. Text: ${adminReviewsText}`,
    );
  } finally {
    await stopNextServer(nextServer);
  }

  const audit = await firestore
    .collection("auditLogs")
    .where("targetId", "==", reviewId)
    .get();
  assert.ok(audit.size >= 5, "Review lifecycle audit trail is incomplete");

  console.log(
    "Phase 14 review flow passed eligibility, validation, moderation, reports, aggregate safety, public pagination, and account UI rendering.",
  );
} finally {
  await deleteApp(app).catch(() => undefined);
}
