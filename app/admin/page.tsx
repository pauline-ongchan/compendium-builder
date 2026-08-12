import { redirect } from "next/navigation";
import { getPortalSession } from "../../auth";
import { RelayWorkspace } from "../relay-workspace";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const [session, { view }] = await Promise.all([getPortalSession(), searchParams]);
  if (!session?.user?.email) redirect("/admin/sign-in");
  return <RelayWorkspace initialMode={view === "exec" ? "exec" : "director"} portalUser={{ name: session.user.name ?? session.user.email, email: session.user.email }} />;
}
