import { authNextFromParams } from "@/lib/auth/navigation";
import { RegisterForm } from "./register-form";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <RegisterForm nextPath={authNextFromParams(await searchParams)} />;
}
