import { ResetPasswordClient } from "./reset-password-client";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <ResetPasswordClient
      code={typeof params.oobCode === "string" ? params.oobCode : undefined}
    />
  );
}
