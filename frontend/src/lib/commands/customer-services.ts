import "server-only";

import {
  createReviewCommandSchema,
  reportReviewCommandSchema,
  ReviewService,
  updateReviewCommandSchema,
} from "@bazm/functions/reviews";
import {
  createReturnCommandSchema,
  ReturnService,
} from "@bazm/functions/returns";
import {
  createTicketCommandSchema,
  CrmService,
  replyToTicketCommandSchema,
} from "@bazm/functions/crm";
import { userRoleSchema } from "@bazm/domain";

import { getServerFirestore } from "@/lib/firebase/admin";
import { getVerifiedSession } from "@/lib/auth/server-session";
import {
  deleteUnreferencedCloudinaryMedia,
  removedMediaPaths,
} from "@/lib/cloudinary/cleanup";

export const customerServiceCommands = {
  async createSupportTicket(uid: string, input: unknown) {
    const parsed = createTicketCommandSchema.parse(input);
    return {
      ok: true as const,
      ...(await new CrmService(getServerFirestore()).createTicket(uid, parsed)),
    };
  },
  async replyToSupportTicket(uid: string, input: unknown) {
    const parsed = replyToTicketCommandSchema.parse(input);
    const claims = await getVerifiedSession();
    const role = userRoleSchema.catch("CUSTOMER").parse(claims?.role);
    return {
      ok: true as const,
      ...(await new CrmService(getServerFirestore()).reply(
        uid,
        role,
        parsed.ticketId,
        parsed.message,
      )),
    };
  },
  async createReturn(uid: string, input: unknown) {
    const parsed = createReturnCommandSchema.parse(input);
    return {
      ok: true as const,
      ...(await new ReturnService(getServerFirestore()).create(uid, parsed)),
    };
  },
  async createReview(uid: string, input: unknown) {
    const parsed = createReviewCommandSchema.parse(input);
    return {
      ok: true as const,
      ...(await new ReviewService(getServerFirestore()).create(uid, parsed)),
    };
  },
  async updateReview(uid: string, input: unknown) {
    const parsed = updateReviewCommandSchema.parse(input);
    const database = getServerFirestore();
    const previous = await database
      .collection("reviews")
      .doc(parsed.reviewId)
      .get();
    const previousImages = previous.get("images");
    const result = {
      ok: true as const,
      ...(await new ReviewService(database).update(
        uid,
        parsed.reviewId,
        parsed.input,
      )),
    };
    if (parsed.input.images !== undefined && Array.isArray(previousImages)) {
      await deleteUnreferencedCloudinaryMedia(
        removedMediaPaths(previousImages, parsed.input.images),
      );
    }
    return result;
  },
  async reportReview(uid: string, input: unknown) {
    return {
      ok: true as const,
      ...(await new ReviewService(getServerFirestore()).report(
        uid,
        reportReviewCommandSchema.parse(input),
      )),
    };
  },
} as const;
