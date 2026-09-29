import { LoginForm } from "./login-form";
import { authNextFromParams } from "@/lib/auth/navigation";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <LoginForm
      nextPath={authNextFromParams(params)}
      reason={typeof params.reason === "string" ? params.reason : undefined}
      resetComplete={params.reset === "complete"}
    />
  );
}
