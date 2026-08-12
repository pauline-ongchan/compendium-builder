import { redirect } from "next/navigation";
import { getPortalSession } from "../../auth";
import { RelayWorkspace } from "../relay-workspace";

export default async function AdminPage() {
  const session = await getPortalSession();
  if (!session?.user?.email) redirect("/admin/sign-in");
  return <RelayWorkspace portalUser={{ name: session.user.name ?? session.user.email, email: session.user.email }} />;
}
