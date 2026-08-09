"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";

export function AdminSignIn({ configured, denied }: { configured: boolean; denied: boolean }) {
  return (
    <main className="access-page">
      <section className="access-card">
        <Link className="access-brand" href="/"><span>R</span> relay</Link>
        <span className="kicker">Protected workspace</span>
        <h1>Administrator sign-in</h1>
        <p>Schedule editing is limited to approved Relay administrators. Your Google session stays active on this device.</p>
        {denied ? <p className="access-error" role="alert">That Google account is not on the administrator allowlist.</p> : null}
        {!configured ? <p className="access-error" role="alert">Google authentication has not been configured for this deployment.</p> : null}
        <button className="button primary access-action" disabled={!configured} onClick={() => void signIn("google", { callbackUrl: "/admin" })}>Continue with Google</button>
        <Link className="access-secondary" href="/">Back to Relay</Link>
      </section>
    </main>
  );
}
