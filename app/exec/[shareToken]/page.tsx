import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPortalSession } from "../../../auth";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function ExecPage({ params, searchParams }: { params: Promise<{ shareToken: string }>; searchParams: Promise<{ view?: string }> }) {
  if (!await getPortalSession()) redirect("/admin/sign-in");
  const [{ shareToken }, { view }] = await Promise.all([params, searchParams]);
  void shareToken;
  void view;
  redirect("/admin?view=exec");
}
