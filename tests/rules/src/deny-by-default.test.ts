import { readFile } from "node:fs/promises";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteApp, initializeApp } from "firebase/app";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import {
  connectStorageEmulator,
  getStorage,
  ref,
  uploadString,
} from "firebase/storage";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const projectId = "demo-bazm-online";
const firestoreRulesUrl = new URL(
  "../../../firebase/firestore.rules",
  import.meta.url,
);
const storageRulesUrl = new URL(
  "../../../firebase/storage.rules",
  import.meta.url,
);
let testEnvironment: RulesTestEnvironment;

const activeCustomerClaims = {
  claimsVersion: 1,
  isActive: true,
  role: "CUSTOMER",
};
const inactiveCustomerClaims = {
  claimsVersion: 1,
  isActive: false,
  role: "CUSTOMER",
};
const activeStaffClaims = {
  claimsVersion: 1,
  isActive: true,
  permissions: ["admin.access"],
  role: "STAFF",
};
const activeAdminClaims = {
  claimsVersion: 1,
  isActive: true,
  role: "ADMIN",
};
const inactiveAdminClaims = {
  claimsVersion: 1,
  isActive: false,
  role: "ADMIN",
};
const staleAdminClaims = {
  claimsVersion: 0,
  isActive: true,
  role: "ADMIN",
};

beforeAll(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: "127.0.0.1",
      port: 8081,
      rules: await readFile(firestoreRulesUrl, "utf8"),
    },
    storage: {
      host: "127.0.0.1",
      port: 9199,
      rules: await readFile(storageRulesUrl, "utf8"),
    },
  });
});

afterAll(async () => {
  await testEnvironment.cleanup();
});

describe("deny-by-default Firebase rules", () => {
  it("denies an unauthenticated Firestore write", async () => {
    const firestore = testEnvironment.unauthenticatedContext().firestore();

    await assertFails(
      setDoc(doc(firestore, "products", "unauthorized-product"), {
        name: "Must not be written",
      }),
    );
  });

  it("denies direct client access to private carts", async () => {
    const ownerFirestore = testEnvironment
      .authenticatedContext("customer-1", activeCustomerClaims)
      .firestore();
    await assertFails(getDoc(doc(ownerFirestore, "carts", "customer-1")));
    await assertFails(
      setDoc(doc(ownerFirestore, "carts", "customer-1", "items", "variant-1"), {
        requestedQuantity: 999,
      }),
    );
  });

  it("allows only an active owner or active current-claim admin to read trusted profiles", async () => {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users", "customer-1"), {
        name: "Customer One",
        email: "customer@example.test",
        phone: null,
        avatarPath: null,
        role: "CUSTOMER",
        isActive: true,
      });
      await setDoc(doc(context.firestore(), "users", "customer-2"), {
        name: "Customer Two",
        email: "other@example.test",
        phone: null,
        avatarPath: null,
        role: "CUSTOMER",
        isActive: true,
      });
    });

    const ownFirestore = testEnvironment
      .authenticatedContext("customer-1", activeCustomerClaims)
      .firestore();
    const inactiveOwnFirestore = testEnvironment
      .authenticatedContext("customer-1", inactiveCustomerClaims)
      .firestore();
    const staleOwnFirestore = testEnvironment
      .authenticatedContext("customer-1", {
        ...activeCustomerClaims,
        claimsVersion: 0,
      })
      .firestore();
    const otherFirestore = testEnvironment
      .authenticatedContext("customer-2", activeCustomerClaims)
      .firestore();
    const staffFirestore = testEnvironment
      .authenticatedContext("staff-1", activeStaffClaims)
      .firestore();
    const adminFirestore = testEnvironment
      .authenticatedContext("admin-1", activeAdminClaims)
      .firestore();
    const inactiveAdminFirestore = testEnvironment
      .authenticatedContext("admin-2", inactiveAdminClaims)
      .firestore();
    const staleAdminFirestore = testEnvironment
      .authenticatedContext("admin-3", staleAdminClaims)
      .firestore();

    await assertSucceeds(getDoc(doc(ownFirestore, "users", "customer-1")));
    await assertSucceeds(getDoc(doc(adminFirestore, "users", "customer-1")));
    await assertFails(
      getDoc(
        doc(
          testEnvironment.unauthenticatedContext().firestore(),
          "users",
          "customer-1",
        ),
      ),
    );
    await assertFails(getDoc(doc(inactiveOwnFirestore, "users", "customer-1")));
    await assertFails(getDoc(doc(staleOwnFirestore, "users", "customer-1")));
    await assertFails(getDoc(doc(otherFirestore, "users", "customer-1")));
    await assertFails(getDoc(doc(staffFirestore, "users", "customer-1")));
    await assertFails(
      getDoc(doc(inactiveAdminFirestore, "users", "customer-1")),
    );
    await assertFails(getDoc(doc(staleAdminFirestore, "users", "customer-1")));
  });

  it("locks customer profile updates to safe owner-owned fields", async () => {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users", "profile-update-owner"), {
        name: "Profile Owner",
        email: "profile-owner@example.test",
        phone: null,
        avatarPath: null,
        role: "CUSTOMER",
        isActive: true,
      });
    });

    const ownFirestore = testEnvironment
      .authenticatedContext("profile-update-owner", activeCustomerClaims)
      .firestore();
    const profile = doc(ownFirestore, "users", "profile-update-owner");

    await assertFails(
      setDoc(profile, {
        email: "created@example.test",
        name: "Created Client Profile",
      }),
    );
    await assertSucceeds(
      updateDoc(profile, {
        name: "Updated Customer",
        phone: "+923001234567",
        avatarPath: "avatars/profile-update-owner/profile",
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(profile, {
        email: "attacker@example.test",
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(updateDoc(profile, { role: "ADMIN" }));
    await assertFails(updateDoc(profile, { isActive: false }));
    await assertFails(updateDoc(profile, { phone: "03001234567" }));
    await assertFails(
      updateDoc(profile, { avatarPath: "avatars/someone-else/profile" }),
    );
    await assertFails(updateDoc(profile, { updatedAt: "not-a-timestamp" }));
  });

  it("denies direct client reads and writes for every trusted business collection", async () => {
    const businessPaths = [
      "auditLogs/audit-1",
      "cartIdempotency/idempotency-1",
      "carts/customer-1",
      "carts/customer-1/items/variant-1",
      "categories/category-1",
      "couponCodeRegistry/hash-1",
      "coupons/coupon-1",
      "customerActivity/activity-1",
      "emailDeliveries/email-1",
      "emailPreviews/email-1",
      "inventory/sku-1",
      "inventoryReservations/reservation-1",
      "inventoryTransactions/transaction-1",
      "orders/order-1",
      "paymentAttempts/payment-1",
      "paymentWebhookEvents/event-1",
      "payments/payment-1",
      "products/product-1",
      "products/product-1/variants/variant-1",
      "refundWebhookEvents/refund-event-1",
      "refunds/refund-1",
      "returns/return-1",
      "reviewReports/report-1",
      "reviews/review-1",
      "settings/storefront",
      "supportTickets/ticket-1",
      "supportTickets/ticket-1/messages/message-1",
      "wishlists/customer-1",
      "wishlists/customer-1/items/product-1",
    ];
    const contexts = [
      testEnvironment.unauthenticatedContext().firestore(),
      testEnvironment
        .authenticatedContext("customer-1", activeCustomerClaims)
        .firestore(),
      testEnvironment
        .authenticatedContext("customer-2", activeCustomerClaims)
        .firestore(),
      testEnvironment
        .authenticatedContext("staff-1", activeStaffClaims)
        .firestore(),
      testEnvironment
        .authenticatedContext("admin-1", activeAdminClaims)
        .firestore(),
    ];

    for (const firestore of contexts) {
      for (const path of businessPaths) {
        await assertFails(getDoc(doc(firestore, path)));
        await assertFails(setDoc(doc(firestore, path), { clientWrite: true }));
      }
    }
    await assertFails(getDocs(collection(contexts.at(-1)!, "products")));
  });

  it("denies an unauthenticated Storage upload", async () => {
    const app = initializeApp(
      {
        apiKey: "demo-api-key",
        projectId,
        storageBucket: `${projectId}.appspot.com`,
      },
      "storage-rules-test",
    );
    const storage = getStorage(app);
    connectStorageEmulator(storage, "127.0.0.1", 9199);

    try {
      await expect(
        uploadString(ref(storage, "products/unauthorized.txt"), "denied"),
      ).rejects.toMatchObject({ code: "storage/unauthorized" });
    } finally {
      await deleteApp(app);
    }
  });

  it("allows only an active owner to manage a constrained avatar", async () => {
    const ownerStorage = testEnvironment
      .authenticatedContext("customer-1", activeCustomerClaims)
      .storage();
    const otherStorage = testEnvironment
      .authenticatedContext("customer-2", activeCustomerClaims)
      .storage();
    const staleOwnerStorage = testEnvironment
      .authenticatedContext("customer-1", {
        ...activeCustomerClaims,
        claimsVersion: 0,
      })
      .storage();

    await assertSucceeds(
      Promise.resolve(
        ownerStorage
          .ref("avatars/customer-1/profile")
          .putString("valid-image", "raw", { contentType: "image/webp" }),
      ),
    );
    await assertFails(
      Promise.resolve(
        otherStorage
          .ref("avatars/customer-1/profile")
          .putString("not-owned", "raw", { contentType: "image/webp" }),
      ),
    );
    await assertFails(
      Promise.resolve(
        staleOwnerStorage
          .ref("avatars/customer-1/profile")
          .putString("stale-claims", "raw", { contentType: "image/webp" }),
      ),
    );
    await assertFails(
      Promise.resolve(
        ownerStorage
          .ref("avatars/customer-1/profile")
          .putString("not-an-image", "raw", { contentType: "text/plain" }),
      ),
    );
  });

  it("allows only an active admin to manage constrained product media", async () => {
    const adminStorage = testEnvironment
      .authenticatedContext("admin-1", activeAdminClaims)
      .storage();
    const customerStorage = testEnvironment
      .authenticatedContext("customer-1", activeCustomerClaims)
      .storage();
    const inactiveAdminStorage = testEnvironment
      .authenticatedContext("admin-2", inactiveAdminClaims)
      .storage();
    const staleAdminStorage = testEnvironment
      .authenticatedContext("admin-3", staleAdminClaims)
      .storage();

    await assertSucceeds(
      Promise.resolve(
        adminStorage
          .ref("products/product-1/hero.webp")
          .putString("valid-image", "raw", { contentType: "image/webp" }),
      ),
    );
    await assertFails(
      Promise.resolve(
        customerStorage
          .ref("products/product-1/hero.webp")
          .putString("forbidden", "raw", { contentType: "image/webp" }),
      ),
    );
    await assertFails(
      Promise.resolve(
        inactiveAdminStorage
          .ref("products/product-1/inactive.webp")
          .putString("inactive-admin", "raw", { contentType: "image/webp" }),
      ),
    );
    await assertFails(
      Promise.resolve(
        staleAdminStorage
          .ref("products/product-1/stale.webp")
          .putString("stale-admin", "raw", { contentType: "image/webp" }),
      ),
    );
    await assertFails(
      Promise.resolve(
        adminStorage
          .ref("products/product-1/hero.txt")
          .putString("invalid", "raw", { contentType: "text/plain" }),
      ),
    );
  });

  it("allows only an active owner to manage constrained review images", async () => {
    const ownerStorage = testEnvironment
      .authenticatedContext("customer-1", activeCustomerClaims)
      .storage();
    const otherStorage = testEnvironment
      .authenticatedContext("customer-2", activeCustomerClaims)
      .storage();
    const disabledStorage = testEnvironment
      .authenticatedContext("customer-3", inactiveCustomerClaims)
      .storage();
    const staleStorage = testEnvironment
      .authenticatedContext("customer-1", {
        ...activeCustomerClaims,
        claimsVersion: 0,
      })
      .storage();

    await assertSucceeds(
      Promise.resolve(
        ownerStorage
          .ref("reviews/customer-1/review.webp")
          .putString("valid-review-image", "raw", {
            contentType: "image/webp",
          }),
      ),
    );
    await assertFails(
      Promise.resolve(
        otherStorage
          .ref("reviews/customer-1/other.webp")
          .putString("wrong-owner", "raw", { contentType: "image/webp" }),
      ),
    );
    await assertFails(
      Promise.resolve(
        disabledStorage
          .ref("reviews/customer-3/disabled.webp")
          .putString("disabled-owner", "raw", { contentType: "image/webp" }),
      ),
    );
    await assertFails(
      Promise.resolve(
        staleStorage
          .ref("reviews/customer-1/stale.webp")
          .putString("stale-owner", "raw", { contentType: "image/webp" }),
      ),
    );
    await assertFails(
      Promise.resolve(
        ownerStorage
          .ref("reviews/customer-1/review.txt")
          .putString("not-an-image", "raw", { contentType: "text/plain" }),
      ),
    );
    await assertFails(
      Promise.resolve(
        ownerStorage
          .ref("reviews/customer-1/too-large.webp")
          .putString("x".repeat(3 * 1024 * 1024 + 1), "raw", {
            contentType: "image/webp",
          }),
      ),
    );
    await assertSucceeds(
      Promise.resolve(
        ownerStorage.ref("reviews/customer-1/review.webp").delete(),
      ),
    );
  });
});
