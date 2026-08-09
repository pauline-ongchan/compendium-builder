import { redirect } from "next/navigation";
import { getAdminSession, isGoogleAuthConfigured } from "../../../auth";
import { AdminSignIn } from "./admin-sign-in";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getAdminSession()) redirect("/admin");
  const { error } = await searchParams;
  return <AdminSignIn configured={isGoogleAuthConfigured()} denied={error === "AccessDenied"} />;
}
