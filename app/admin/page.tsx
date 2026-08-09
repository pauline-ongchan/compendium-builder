import { redirect } from "next/navigation";
import { getAdminSession } from "../../auth";
import { RelayWorkspace } from "../relay-workspace";

export default async function AdminPage() {
  const session = await getAdminSession();
  if (!session?.user?.email) redirect("/admin/sign-in");
  return <RelayWorkspace experience="admin" adminUser={{ name: session.user.name ?? session.user.email, email: session.user.email }} />;
}
