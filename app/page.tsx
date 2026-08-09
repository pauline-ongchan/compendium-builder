import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Relay — Event operations, in sync",
  description:
    "Plan multi-day events, coordinate availability, assign roles, and publish a personalized day-of plan from one shared source of truth.",
};

export default function Home() {
  return (
    <main className="access-page">
      <section className="access-card landing-card">
        <div className="access-brand"><span>R</span> relay</div>
        <span className="kicker">Event operations, in sync</span>
        <h1>One plan for the people making it happen.</h1>
        <p>Exec schedules are shared through a private event link. Administrators can sign in to plan, publish, and manage access.</p>
        <Link className="button primary access-action" href="/admin">Open admin workspace</Link>
        <small>Looking for your exec schedule? Open the event link shared by your organizer.</small>
      </section>
    </main>
  );
}
