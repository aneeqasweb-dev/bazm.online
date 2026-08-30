"use client";

import {
  createCategoryInputSchema,
  updateCategoryInputSchema,
} from "@bazm/domain";
import { FirebaseError } from "firebase/app";
import { httpsCallable } from "firebase/functions";
import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import type { CategorySummary } from "@/lib/categories/server";
import { getFirebaseClientServices } from "@/lib/firebase/client";

type FormErrors = Partial<
  Record<"name" | "slug" | "parentId" | "image" | "seo", string>
>;

type CategoryDraft = {
  name: string;
  slug: string;
  parentId: string;
  imagePath: string;
  imageUrl: string;
  imageAlt: string;
  imageWidth: string;
  imageHeight: string;
  imageType: "image/jpeg" | "image/png" | "image/webp";
  imageHash: string;
  seoTitle: string;
  seoDescription: string;
};

const emptyDraft: CategoryDraft = {
  name: "",
  slug: "",
  parentId: "",
  imagePath: "",
  imageUrl: "",
  imageAlt: "",
  imageWidth: "",
  imageHeight: "",
  imageType: "image/webp",
  imageHash: "",
  seoTitle: "",
  seoDescription: "",
};

function toDraft(category?: CategorySummary): CategoryDraft {
  if (!category) return emptyDraft;
  return {
    name: category.name,
    slug: category.slug,
    parentId: category.parentId ?? "",
    imagePath: category.image?.path ?? "",
    imageUrl: category.image?.url ?? "",
    imageAlt: category.image?.alt ?? "",
    imageWidth: category.image ? String(category.image.width) : "",
    imageHeight: category.image ? String(category.image.height) : "",
    imageType: category.image?.contentType ?? "image/webp",
    imageHash: category.image?.contentHash ?? "",
    seoTitle: category.seo.title ?? "",
    seoDescription: category.seo.description ?? "",
  };
}

function formatFunctionError(error: unknown) {
  if (error instanceof FirebaseError)
    return error.message.replace(/^.*?:\s*/, "");
  return "We could not save this category. Refresh and try again.";
}

function categoryIndent(depth: number) {
  return "— ".repeat(depth);
}

export function CategoryWorkspace({
  categories,
}: {
  categories: CategorySummary[];
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CategoryDraft>(emptyDraft);
  const [errors, setErrors] = useState<FormErrors>({});
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [failure, setFailure] = useState<string>();
  const editing = categories.find((category) => category.id === editingId);
  const eligibleParents = useMemo(
    () =>
      categories.filter(
        (category) =>
          category.id !== editingId &&
          category.status !== "ARCHIVED" &&
          category.depth < 3,
      ),
    [categories, editingId],
  );

  function change(field: keyof CategoryDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function beginEdit(category: CategorySummary) {
    setEditingId(category.id);
    setDraft(toDraft(category));
    setErrors({});
    setNotice(undefined);
    setFailure(undefined);
  }

  function resetForm() {
    setEditingId(null);
    setDraft(emptyDraft);
    setErrors({});
  }

  function parseInput() {
    const imageEntered = [
      draft.imagePath,
      draft.imageUrl,
      draft.imageAlt,
      draft.imageWidth,
      draft.imageHeight,
      draft.imageHash,
    ].some(Boolean);
    const value = {
      name: draft.name,
      slug: draft.slug,
      parentId: draft.parentId || null,
      image: imageEntered
        ? {
            path: draft.imagePath,
            url: draft.imageUrl,
            alt: draft.imageAlt,
            width: Number(draft.imageWidth),
            height: Number(draft.imageHeight),
            contentType: draft.imageType,
            contentHash: draft.imageHash,
            sortOrder: 0,
          }
        : null,
      seo: {
        title: draft.seoTitle || null,
        description: draft.seoDescription || null,
      },
    };
    return editingId
      ? updateCategoryInputSchema.safeParse(value)
      : createCategoryInputSchema.safeParse(value);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setNotice(undefined);
    setFailure(undefined);
    const parsed = parseInput();
    if (!parsed.success) {
      const nextErrors: FormErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof FormErrors;
        nextErrors[field === "image" || field === "seo" ? field : field] ??=
          issue.message;
      }
      setErrors(nextErrors);
      return;
    }

    setPending(true);
    try {
      const { functions } = getFirebaseClientServices();
      if (editingId) {
        const updateCategory = httpsCallable(functions, "updateCategory");
        await updateCategory({ id: editingId, input: parsed.data });
        setNotice("Category updated.");
      } else {
        const createCategory = httpsCallable(functions, "createCategory");
        await createCategory({ ...parsed.data, sortOrder: categories.length });
        setNotice(
          "Draft category created. Activate it when the hierarchy is ready.",
        );
      }
      resetForm();
      router.refresh();
    } catch (error) {
      setFailure(formatFunctionError(error));
    } finally {
      setPending(false);
    }
  }

  async function setStatus(id: string, status: CategorySummary["status"]) {
    setPending(true);
    setNotice(undefined);
    setFailure(undefined);
    try {
      const { functions } = getFirebaseClientServices();
      const updateStatus = httpsCallable(functions, "setCategoryStatus");
      await updateStatus({ id, status });
      setNotice(`Category ${status.toLowerCase()}.`);
      router.refresh();
    } catch (error) {
      setFailure(formatFunctionError(error));
    } finally {
      setPending(false);
    }
  }

  async function move(category: CategorySummary, direction: -1 | 1) {
    const siblings = categories.filter(
      (candidate) => candidate.parentId === category.parentId,
    );
    const currentIndex = siblings.findIndex(
      (candidate) => candidate.id === category.id,
    );
    const destinationIndex = currentIndex + direction;
    if (destinationIndex < 0 || destinationIndex >= siblings.length) return;
    const nextOrder = [...siblings];
    [nextOrder[currentIndex], nextOrder[destinationIndex]] = [
      nextOrder[destinationIndex],
      nextOrder[currentIndex],
    ];
    setPending(true);
    setNotice(undefined);
    setFailure(undefined);
    try {
      const { functions } = getFirebaseClientServices();
      const reorderCategories = httpsCallable(functions, "reorderCategories");
      await reorderCategories({
        parentId: category.parentId,
        categoryIds: nextOrder.map((item) => item.id),
      });
      setNotice("Category order updated.");
      router.refresh();
    } catch (error) {
      setFailure(formatFunctionError(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_26rem]">
      <section
        aria-labelledby="category-list-heading"
        className="rounded-3xl border border-stone-800 bg-stone-900 p-5 sm:p-7"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium tracking-[0.22em] text-amber-300 uppercase">
              Catalog structure
            </p>
            <h2
              className="mt-2 text-2xl font-semibold"
              id="category-list-heading"
            >
              Categories
            </h2>
          </div>
          <p className="text-sm text-stone-400">
            {categories.length} of 100 shown
          </p>
        </div>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="border-b border-stone-800 text-xs tracking-[0.16em] text-stone-500 uppercase">
              <tr>
                <th className="pb-3 font-medium">Category</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium">Order</th>
                <th className="pb-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <tr className="border-b border-stone-800/80" key={category.id}>
                  <td className="py-4">
                    <p className="font-medium">
                      {categoryIndent(category.depth)}
                      {category.name}
                    </p>
                    <p className="mt-1 text-xs text-stone-500">
                      /{category.slug}
                    </p>
                  </td>
                  <td className="py-4">
                    <span className="rounded-full border border-stone-700 px-2 py-1 text-xs text-stone-300">
                      {category.status.toLowerCase()}
                    </span>
                  </td>
                  <td className="py-4">
                    <div className="flex gap-1">
                      <button
                        aria-label={`Move ${category.name} earlier`}
                        className="rounded border border-stone-700 px-2 py-1 disabled:opacity-40"
                        disabled={pending}
                        onClick={() => move(category, -1)}
                        type="button"
                      >
                        ↑
                      </button>
                      <button
                        aria-label={`Move ${category.name} later`}
                        className="rounded border border-stone-700 px-2 py-1 disabled:opacity-40"
                        disabled={pending}
                        onClick={() => move(category, 1)}
                        type="button"
                      >
                        ↓
                      </button>
                    </div>
                  </td>
                  <td className="py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        className="rounded-full border border-stone-700 px-3 py-1.5 text-xs hover:border-stone-500"
                        onClick={() => beginEdit(category)}
                        type="button"
                      >
                        Edit
                      </button>
                      {category.status !== "ACTIVE" ? (
                        <button
                          className="rounded-full border border-emerald-800 px-3 py-1.5 text-xs text-emerald-200 disabled:opacity-40"
                          disabled={pending}
                          onClick={() => setStatus(category.id, "ACTIVE")}
                          type="button"
                        >
                          Activate
                        </button>
                      ) : (
                        <button
                          className="rounded-full border border-amber-900 px-3 py-1.5 text-xs text-amber-200 disabled:opacity-40"
                          disabled={pending}
                          onClick={() => setStatus(category.id, "ARCHIVED")}
                          type="button"
                        >
                          Archive
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {categories.length === 0 ? (
                <tr>
                  <td className="py-10 text-center text-stone-400" colSpan={4}>
                    No categories yet. Create the first root category.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section
        aria-labelledby="category-form-heading"
        className="rounded-3xl border border-stone-800 bg-stone-900 p-5 sm:p-7"
      >
        <p className="text-xs font-medium tracking-[0.22em] text-amber-300 uppercase">
          {editing ? "Edit category" : "New category"}
        </p>
        <h2 className="mt-2 text-2xl font-semibold" id="category-form-heading">
          {editing ? editing.name : "Add a category"}
        </h2>
        <form className="mt-6 space-y-4" noValidate onSubmit={handleSubmit}>
          <Field error={errors.name} label="Name">
            <input
              className="field"
              onChange={(event) => change("name", event.target.value)}
              value={draft.name}
            />
          </Field>
          <Field error={errors.slug} label="Slug">
            <input
              className="field"
              onChange={(event) => change("slug", event.target.value)}
              value={draft.slug}
            />
          </Field>
          <Field error={errors.parentId} label="Parent category">
            <select
              className="field"
              onChange={(event) => change("parentId", event.target.value)}
              value={draft.parentId}
            >
              <option value="">No parent (root category)</option>
              {eligibleParents.map((category) => (
                <option key={category.id} value={category.id}>
                  {categoryIndent(category.depth)}
                  {category.name}
                </option>
              ))}
            </select>
          </Field>
          <details className="rounded-2xl border border-stone-800 p-4">
            <summary className="cursor-pointer text-sm font-medium">
              Image fields (optional)
            </summary>
            <div className="mt-4 grid gap-3">
              <Field error={errors.image} label="Storage path">
                <input
                  className="field"
                  onChange={(event) => change("imagePath", event.target.value)}
                  value={draft.imagePath}
                />
              </Field>
              <Field error={errors.image} label="Public image URL">
                <input
                  className="field"
                  onChange={(event) => change("imageUrl", event.target.value)}
                  value={draft.imageUrl}
                />
              </Field>
              <Field error={errors.image} label="Alt text">
                <input
                  className="field"
                  onChange={(event) => change("imageAlt", event.target.value)}
                  value={draft.imageAlt}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field error={errors.image} label="Width">
                  <input
                    className="field"
                    inputMode="numeric"
                    onChange={(event) =>
                      change("imageWidth", event.target.value)
                    }
                    value={draft.imageWidth}
                  />
                </Field>
                <Field error={errors.image} label="Height">
                  <input
                    className="field"
                    inputMode="numeric"
                    onChange={(event) =>
                      change("imageHeight", event.target.value)
                    }
                    value={draft.imageHeight}
                  />
                </Field>
              </div>
              <Field error={errors.image} label="Content hash">
                <input
                  className="field"
                  onChange={(event) => change("imageHash", event.target.value)}
                  value={draft.imageHash}
                />
              </Field>
            </div>
          </details>
          <details className="rounded-2xl border border-stone-800 p-4">
            <summary className="cursor-pointer text-sm font-medium">
              SEO fields
            </summary>
            <div className="mt-4 grid gap-3">
              <Field error={errors.seo} label="SEO title">
                <input
                  className="field"
                  onChange={(event) => change("seoTitle", event.target.value)}
                  value={draft.seoTitle}
                />
              </Field>
              <Field error={errors.seo} label="SEO description">
                <textarea
                  className="field min-h-24"
                  onChange={(event) =>
                    change("seoDescription", event.target.value)
                  }
                  value={draft.seoDescription}
                />
              </Field>
            </div>
          </details>
          {notice ? (
            <p aria-live="polite" className="text-sm text-emerald-300">
              {notice}
            </p>
          ) : null}
          {failure ? (
            <p aria-live="assertive" className="text-sm text-red-300">
              {failure}
            </p>
          ) : null}
          <div className="flex gap-3">
            <button
              className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-stone-950 disabled:opacity-50"
              disabled={pending}
              type="submit"
            >
              {pending ? "Saving…" : editing ? "Save changes" : "Create draft"}
            </button>
            {editing ? (
              <button
                className="rounded-full border border-stone-700 px-5 py-3 text-sm disabled:opacity-50"
                disabled={pending}
                onClick={resetForm}
                type="button"
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </section>
    </div>
  );
}

function Field({
  children,
  error,
  label,
}: {
  children: React.ReactNode;
  error?: string;
  label: string;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-red-300">{error}</span>
      ) : null}
    </label>
  );
}
