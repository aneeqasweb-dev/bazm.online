import { ResetPasswordClient } from "./reset-password-client";
import { authNextFromParams } from "@/lib/auth/navigation";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <ResetPasswordClient
      nextPath={authNextFromParams(params)}
      code={typeof params.oobCode === "string" ? params.oobCode : undefined}
    />
  );
}
