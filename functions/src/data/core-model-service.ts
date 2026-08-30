import { DomainError, publicProductReadSchema } from "@bazm/domain";

import type { CoreRepositories } from "./core-repositories.js";

/**
 * Service methods are the only layer that shapes repository records for a
 * consumer. Feature phases add authorization and business transitions here.
 */
export class CoreModelService {
  constructor(private readonly repositories: CoreRepositories) {}

  async getPublishedProduct(id: string) {
    const product = await this.repositories.products.getOrThrow(id);
    if (product.status !== "PUBLISHED") {
      throw new DomainError(
        "NOT_FOUND",
        "The requested product does not exist.",
      );
    }

    return publicProductReadSchema.parse({
      id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      categoryId: product.categoryId,
      categoryPath: product.categoryPath,
      basePrice: product.basePrice,
      media: product.media,
      tags: product.tags,
      flags: product.flags,
      seo: product.seo,
    });
  }
}
