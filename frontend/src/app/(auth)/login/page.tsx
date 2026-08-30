import { LoginForm } from "./login-form";

function safeNextPath(value: string | string[] | undefined) {
  const path = typeof value === "string" ? value : "/account";
  return path.startsWith("/") && !path.startsWith("//") ? path : "/account";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <LoginForm
      nextPath={safeNextPath(params.next)}
      reason={typeof params.reason === "string" ? params.reason : undefined}
      resetComplete={params.reset === "complete"}
    />
  );
}
