"use client";

import { useState, type FormEvent } from "react";

import { AuthField, AuthMessage } from "@/components/auth/auth-shell";
import { getAuthErrorMessage } from "@/lib/auth/auth-errors";
import { profileSchema } from "@/lib/auth/auth-schema";
import { updateProfile, validateAvatar } from "@/lib/auth/profile-client";

type ProfileErrors = Partial<Record<"name" | "phone" | "avatar", string>>;

export function ProfileForm({
  initialName,
  initialPhone,
  initialAvatarPath,
}: {
  initialName: string;
  initialPhone: string;
  initialAvatarPath: string | null;
}) {
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [avatarPath, setAvatarPath] = useState(initialAvatarPath);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setSaved(false);
    setFormError(undefined);
    const form = new FormData(event.currentTarget);
    const parsed = profileSchema.safeParse({
      name: form.get("name"),
      phone: form.get("phone"),
    });
    const avatarValue = form.get("avatar");
    const avatar =
      avatarValue instanceof File && avatarValue.size ? avatarValue : undefined;
    const removeAvatar = form.get("removeAvatar") === "on";

    const nextErrors: ProfileErrors = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as "name" | "phone";
        nextErrors[field] ??= issue.message;
      }
    }
    if (avatar) {
      nextErrors.avatar = validateAvatar(avatar) ?? undefined;
    }
    if (Object.values(nextErrors).some(Boolean) || !parsed.success) {
      setErrors(nextErrors);
      return;
    }

    setPending(true);
    try {
      const result = await updateProfile({
        ...parsed.data,
        avatar,
        currentAvatarPath: avatarPath,
        removeAvatar,
      });
      setAvatarPath(result.avatarPath);
      setSaved(true);
      event.currentTarget.reset();
    } catch (error) {
      setFormError(
        error instanceof Error && error.message.startsWith("Choose")
          ? error.message
          : getAuthErrorMessage(
              error,
              "We could not save your profile. Sign in again and retry.",
            ),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="mt-8 space-y-5" noValidate onSubmit={handleSubmit}>
      <AuthField
        label="Full name"
        name="name"
        autoComplete="name"
        defaultValue={initialName}
        error={errors.name}
      />
      <AuthField
        label="Phone"
        name="phone"
        type="tel"
        autoComplete="tel"
        defaultValue={initialPhone}
        error={errors.phone}
        hint="Optional. Use the +92 international format."
      />
      <div>
        <label className="mb-2 block text-sm font-medium" htmlFor="avatar">
          Profile image
        </label>
        <input
          accept="image/jpeg,image/png,image/webp"
          aria-describedby="avatar-description"
          aria-invalid={Boolean(errors.avatar)}
          className="block w-full rounded-xl border border-stone-700 bg-stone-900 p-3 text-sm file:mr-4 file:rounded-full file:border-0 file:bg-amber-300 file:px-4 file:py-2 file:font-semibold file:text-stone-950"
          id="avatar"
          name="avatar"
          type="file"
        />
        <p
          className={`mt-2 text-sm ${errors.avatar ? "text-red-300" : "text-stone-500"}`}
          id="avatar-description"
        >
          {errors.avatar ?? "JPEG, PNG, or WebP; no larger than 4 MB."}
        </p>
      </div>
      {avatarPath ? (
        <label className="flex items-center gap-3 text-sm text-stone-300">
          <input
            className="size-4 accent-amber-300"
            name="removeAvatar"
            type="checkbox"
          />
          Remove the current profile image
        </label>
      ) : null}
      {saved ? <AuthMessage kind="success">Profile saved.</AuthMessage> : null}
      {formError ? <AuthMessage>{formError}</AuthMessage> : null}
      <button
        className="h-12 w-full rounded-full bg-amber-300 font-semibold text-stone-950 disabled:cursor-wait disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
