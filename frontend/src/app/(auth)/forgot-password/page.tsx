import { authNextFromParams } from "@/lib/auth/navigation";
import { ForgotPasswordForm } from "./forgot-password-form";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <ForgotPasswordForm nextPath={authNextFromParams(await searchParams)} />
  );
}
