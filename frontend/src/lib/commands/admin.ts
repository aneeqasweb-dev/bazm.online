import "server-only";

import {
  documentIdSchema,
  refundInputSchema,
  userRoleSchema,
  type AdminPermission,
} from "@bazm/domain";
import {
  AdminOperationsService,
  couponStatusCommandSchema,
  createCouponCommandSchema,
  moderateReviewCommandSchema,
  updateCouponCommandSchema,
  updateReturnStatusCommandSchema,
  updateUserAccessCommandSchema,
  upsertSettingsCommandSchema,
} from "@bazm/functions/admin";
import {
  CategoryService,
  categoryStatusCommandSchema,
  createCategoryCommandSchema,
  reorderCategoriesCommandSchema,
  updateCategoryCommandSchema,
} from "@bazm/functions/categories";
import { CrmService, manageTicketCommandSchema } from "@bazm/functions/crm";
import {
  inventoryAdjustmentCommandSchema,
  inventoryQuantityCommandSchema,
  InventoryService,
  receiveInventoryCommandSchema,
} from "@bazm/functions/inventory";
import {
  OrderService,
  orderTransitionCommandSchema,
} from "@bazm/functions/orders";
import { PaymentService } from "@bazm/functions/payments";
import {
  createProductCommandSchema,
  createVariantCommandSchema,
  ProductService,
  productStatusCommandSchema,
  updateProductCommandSchema,
  updateVariantCommandSchema,
} from "@bazm/functions/products";
import { z } from "zod";

import { getServerAuth, getServerFirestore } from "@/lib/firebase/admin";
import type { SessionClaims } from "@/lib/auth/server-authorization";
import {
  deleteUnreferencedCloudinaryMedia,
  removedMediaPaths,
} from "@/lib/cloudinary/cleanup";

type AdminContext = { actorId: string; claims: SessionClaims };
type AdminHandler = (context: AdminContext, input: unknown) => Promise<unknown>;

const categoryUpdateSchema = z
  .object({ id: documentIdSchema, input: updateCategoryCommandSchema })
  .strict();
const productUpdateSchema = z
  .object({ id: documentIdSchema, input: updateProductCommandSchema })
  .strict();

function adminService() {
  return new AdminOperationsService(getServerFirestore(), getServerAuth());
}

function actorRole(claims: SessionClaims) {
  return userRoleSchema.parse(claims.role);
}

export const adminCommandPermissions: Record<string, AdminPermission> = {
  createCategory: "catalog.manage",
  updateCategory: "catalog.manage",
  setCategoryStatus: "catalog.manage",
  reorderCategories: "catalog.manage",
  createProduct: "catalog.manage",
  updateProduct: "catalog.manage",
  setProductStatus: "catalog.manage",
  createProductVariant: "catalog.manage",
  updateProductVariant: "catalog.manage",
  receiveInventory: "inventory.manage",
  adjustInventory: "inventory.manage",
  restoreInventoryReturn: "inventory.manage",
  recordInventoryDamage: "inventory.manage",
  updateUserAccess: "customers.manage",
  transitionOrder: "orders.manage",
  initiateRefund: "payments.manage",
  createCoupon: "coupons.manage",
  updateCoupon: "coupons.manage",
  setCouponStatus: "coupons.manage",
  moderateReview: "reviews.manage",
  updateReturnStatus: "returns.manage",
  manageSupportTicket: "support.manage",
  upsertSettings: "settings.manage",
};

export const adminCommands: Record<string, AdminHandler> = {
  async createCategory(_context, input) {
    return new CategoryService(getServerFirestore()).create(
      createCategoryCommandSchema.parse(input),
    );
  },
  async updateCategory(_context, input) {
    const parsed = categoryUpdateSchema.parse(input);
    const database = getServerFirestore();
    const previous = await database
      .collection("categories")
      .doc(parsed.id)
      .get();
    const previousImage = previous.get("image");
    const result = await new CategoryService(database).update(
      parsed.id,
      parsed.input,
    );
    if (parsed.input.image !== undefined && previousImage?.path) {
      await deleteUnreferencedCloudinaryMedia(
        removedMediaPaths(
          [previousImage],
          parsed.input.image ? [parsed.input.image] : [],
        ),
      );
    }
    return result;
  },
  async setCategoryStatus(_context, input) {
    return new CategoryService(getServerFirestore()).setStatus(
      categoryStatusCommandSchema.parse(input),
    );
  },
  async reorderCategories(_context, input) {
    return new CategoryService(getServerFirestore()).reorder(
      reorderCategoriesCommandSchema.parse(input),
    );
  },
  async createProduct(_context, input) {
    return new ProductService(getServerFirestore()).create(
      createProductCommandSchema.parse(input),
    );
  },
  async updateProduct(_context, input) {
    const parsed = productUpdateSchema.parse(input);
    const database = getServerFirestore();
    const previous = await database.collection("products").doc(parsed.id).get();
    const previousMedia = previous.get("media");
    const result = await new ProductService(database).update(
      parsed.id,
      parsed.input,
    );
    if (parsed.input.media !== undefined && Array.isArray(previousMedia)) {
      await deleteUnreferencedCloudinaryMedia(
        removedMediaPaths(previousMedia, parsed.input.media),
      );
    }
    return result;
  },
  async setProductStatus(_context, input) {
    return new ProductService(getServerFirestore()).setStatus(
      productStatusCommandSchema.parse(input),
    );
  },
  async createProductVariant(_context, input) {
    return new ProductService(getServerFirestore()).createVariant(
      createVariantCommandSchema.parse(input),
    );
  },
  async updateProductVariant(_context, input) {
    return new ProductService(getServerFirestore()).updateVariant(
      updateVariantCommandSchema.parse(input),
    );
  },
  async receiveInventory(context, input) {
    return new InventoryService(getServerFirestore()).receive(
      receiveInventoryCommandSchema.parse(input),
      context.actorId,
    );
  },
  async adjustInventory(context, input) {
    return new InventoryService(getServerFirestore()).adjust(
      inventoryAdjustmentCommandSchema.parse(input),
      context.actorId,
    );
  },
  async restoreInventoryReturn(context, input) {
    return new InventoryService(getServerFirestore()).restoreReturn(
      inventoryQuantityCommandSchema.parse(input),
      context.actorId,
    );
  },
  async recordInventoryDamage(context, input) {
    return new InventoryService(getServerFirestore()).recordDamage(
      inventoryQuantityCommandSchema.parse(input),
      context.actorId,
    );
  },
  async updateUserAccess(context, input) {
    return adminService().updateUserAccess(
      context.actorId,
      actorRole(context.claims),
      updateUserAccessCommandSchema.parse(input),
    );
  },
  async transitionOrder(context, input) {
    return new OrderService(getServerFirestore()).transition(
      context.actorId,
      orderTransitionCommandSchema.parse(input),
    );
  },
  async initiateRefund(context, input) {
    return new PaymentService(getServerFirestore()).initiateRefund(
      context.actorId,
      refundInputSchema.parse(input),
    );
  },
  async createCoupon(context, input) {
    return adminService().createCoupon(
      context.actorId,
      createCouponCommandSchema.parse(input),
    );
  },
  async updateCoupon(context, input) {
    return adminService().updateCoupon(
      context.actorId,
      updateCouponCommandSchema.parse(input),
    );
  },
  async setCouponStatus(context, input) {
    return adminService().setCouponStatus(
      context.actorId,
      couponStatusCommandSchema.parse(input),
    );
  },
  async moderateReview(context, input) {
    return adminService().moderateReview(
      context.actorId,
      moderateReviewCommandSchema.parse(input),
    );
  },
  async updateReturnStatus(context, input) {
    return adminService().updateReturnStatus(
      context.actorId,
      updateReturnStatusCommandSchema.parse(input),
    );
  },
  async manageSupportTicket(context, input) {
    return new CrmService(getServerFirestore()).manage(
      context.actorId,
      manageTicketCommandSchema.parse(input),
    );
  },
  async upsertSettings(context, input) {
    return adminService().upsertSettings(
      context.actorId,
      upsertSettingsCommandSchema.parse(input),
    );
  },
};
