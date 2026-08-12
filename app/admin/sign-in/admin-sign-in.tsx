"use client";

import { signIn } from "next-auth/react";

export function AdminSignIn({ configured, denied }: { configured: boolean; denied: boolean }) {
  return (
    <main className="access-page sign-in-page">
      <section className="access-card sign-in-card">
        <div className="access-brand sign-in-brand"><span>R</span> relay</div>
        <div className="sign-in-heading">
          <h1>Sign in</h1>
        </div>
        {denied ? <p className="access-error" role="alert">That Google account is not a verified BizTech account.</p> : null}
        {!configured ? <p className="access-error" role="alert">Google authentication has not been configured for this deployment.</p> : null}
        <button className="google-sign-in" disabled={!configured} onClick={() => void signIn("google", { callbackUrl: "/admin" })}><span className="google-mark" aria-hidden="true">G</span>Sign in with Google</button>
      </section>
    </main>
  );
}
