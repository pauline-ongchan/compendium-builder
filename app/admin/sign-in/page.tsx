import { redirect } from "next/navigation";
import { getPortalSession, isGoogleAuthConfigured } from "../../../auth";
import { AdminSignIn } from "./admin-sign-in";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getPortalSession()) redirect("/admin");
  const { error } = await searchParams;
  return <AdminSignIn configured={isGoogleAuthConfigured()} denied={error === "AccessDenied"} />;
}
