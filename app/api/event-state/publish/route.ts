import { eq } from "drizzle-orm";
import { requirePortalApi } from "../../../../auth";
import { ensureDb, getDb } from "../../../../db";
import { eventStates } from "../../../../db/schema";
import { mapTimeAvailabilityToBlocks, type AvailabilityState } from "../../../availability";
import { createShareToken } from "../route";

export async function POST(request: Request) {
  const authorization = await requirePortalApi();
  if ("response" in authorization) return authorization.response;

  try {
    const raw = await request.json();
    if (!raw || typeof raw !== "object" || typeof raw.eventId !== "string" || typeof raw.eventName !== "string" || !Array.isArray(raw.days) || !Array.isArray(raw.people)) {
      return Response.json({ error: "Invalid event state" }, { status: 400 });
    }
    const clean = { ...(raw as Record<string, unknown>) };
    delete clean.relayMeta;
    const state = mapTimeAvailabilityToBlocks(clean as AvailabilityState & Record<string, unknown>);
    const payload = JSON.stringify(state);
    const now = new Date().toISOString();
    await ensureDb();
    const existing = await getDb().select().from(eventStates).where(eq(eventStates.id, raw.eventId)).limit(1);
    const shareToken = existing[0]?.shareToken ?? createShareToken();
    await getDb().insert(eventStates).values({
      id: raw.eventId,
      payload,
      publishedPayload: payload,
      shareToken,
      updatedBy: authorization.email,
      publishedAt: now,
      publishedBy: authorization.email,
    }).onConflictDoUpdate({
      target: eventStates.id,
      set: { payload, publishedPayload: payload, shareToken, updatedBy: authorization.email, updatedAt: now, publishedAt: now, publishedBy: authorization.email },
    });
    return Response.json({
      ok: true,
      state: {
        ...state,
        relayMeta: { shareToken, updatedAt: now, updatedBy: authorization.email, publishedAt: now, publishedBy: authorization.email },
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to publish event" }, { status: 500 });
  }
}
