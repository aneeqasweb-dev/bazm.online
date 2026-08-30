import "./config/runtime.js";

import { logger } from "firebase-functions";
import { onRequest } from "firebase-functions/v2/https";

import { successResponse } from "./lib/api-response.js";
import { resolveRequestId } from "./lib/request-id.js";

export { completeRegistration } from "./auth/registration.js";
export { synchronizeAuthorization } from "./auth/authorization.js";
export { updateMyProfile } from "./auth/profile.js";
export {
  createCoupon,
  moderateReview,
  setCouponStatus,
  updateCoupon,
  updateReturnStatus,
  updateUserAccess,
  upsertSettings,
} from "./admin/admin.js";
export {
  createCategory,
  reorderCategories,
  setCategoryStatus,
  updateCategory,
} from "./categories/category.js";
export {
  createProduct,
  createProductVariant,
  setProductStatus,
  updateProduct,
  updateProductVariant,
} from "./products/product.js";
export { addWishlistItem, removeWishlistItem } from "./storefront/wishlist.js";
export {
  addCartItem,
  moveCartItemToWishlist,
  removeCartItem,
  updateCartItem,
} from "./storefront/cart.js";
export {
  adjustInventory,
  expireInventoryReservations,
  finalizeInventoryReservation,
  receiveInventory,
  recordInventoryDamage,
  releaseInventoryReservation,
  reserveInventory,
  restoreInventoryReturn,
  runInventoryExpiryCleanup,
} from "./inventory/inventory.js";
export {
  cancelMyOrder,
  createAddress,
  createCheckout,
  transitionOrder,
  updateAddress,
} from "./orders/order.js";
export { createReturn } from "./returns/return.js";
export {
  createPaymentAttempt,
  initiateRefund,
  paymentWebhook,
  refundWebhook,
} from "./payments/payment.js";
export {
  requestPasswordResetEmail,
  retryEmailDeliveries,
  retryEmailDeliveriesScheduled,
  sendReturnRequestedEmail,
  sendReturnUpdatedEmail,
  sendVerificationEmail,
} from "./email/email.js";
export {
  createSupportTicket,
  manageSupportTicket,
  recordCustomerActivity,
  replyToSupportTicket,
} from "./crm/crm.js";
export { createReview, reportReview, updateReview } from "./reviews/review.js";

export const health = onRequest(
  { region: "asia-south1" },
  (request, response) => {
    const requestId = resolveRequestId(request.get("x-request-id"));

    logger.info("health_check.completed", {
      requestId,
      service: "bazm-functions",
      structuredData: true,
    });
    response
      .status(200)
      .json(
        successResponse({ status: "ok", service: "bazm-functions" }, requestId),
      );
  },
);
