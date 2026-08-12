import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Relay — Event operations, in sync",
  description:
    "Plan multi-day events, coordinate availability, assign roles, and publish a personalized day-of plan from one shared source of truth.",
};

export default function Home() {
  redirect("/admin/sign-in");
}
