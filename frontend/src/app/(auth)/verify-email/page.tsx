import { VerifyEmailClient } from "./verify-email-client";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <VerifyEmailClient
      code={typeof params.oobCode === "string" ? params.oobCode : undefined}
    />
  );
}
