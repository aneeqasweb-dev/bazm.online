import { VerifyEmailClient } from "./verify-email-client";
import { authNextFromParams } from "@/lib/auth/navigation";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <VerifyEmailClient
      nextPath={authNextFromParams(params)}
      code={typeof params.oobCode === "string" ? params.oobCode : undefined}
    />
  );
}
