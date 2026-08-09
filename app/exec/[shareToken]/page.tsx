import type { Metadata } from "next";
import { RelayWorkspace } from "../../relay-workspace";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function ExecPage({ params, searchParams }: { params: Promise<{ shareToken: string }>; searchParams: Promise<{ view?: string }> }) {
  const [{ shareToken }, { view }] = await Promise.all([params, searchParams]);
  const initialSection = view === "availability" || view === "prep" ? view : "today";
  return <RelayWorkspace experience="exec" shareToken={shareToken} initialExecSection={initialSection} />;
}
