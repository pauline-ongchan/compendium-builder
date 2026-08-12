import { randomBytes } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { requirePortalApi } from "../../../auth";
import { mapTimeAvailabilityToBlocks, type AvailabilityState } from "../../availability";
import { ensureDb, getDb } from "../../../db";
import { eventStates } from "../../../db/schema";

export function createShareToken() {
  return randomBytes(24).toString("base64url");
}

function validState(value: unknown): value is AvailabilityState & { eventId: string; eventName: string } {
  if (!value || typeof value !== "object") return false;
  const state = value as Record<string, unknown>;
  return typeof state.eventId === "string" && typeof state.eventName === "string" && Array.isArray(state.days) && Array.isArray(state.people);
}

function persistencePayload(state: Record<string, unknown>) {
  const payload = { ...state };
  delete payload.relayMeta;
  return payload;
}

function withMetadata(payload: Record<string, unknown>, record: typeof eventStates.$inferSelect) {
  return {
    ...payload,
    eventId: payload.eventId ?? record.id,
    relayMeta: {
      shareToken: record.shareToken,
      updatedAt: record.updatedAt,
      updatedBy: record.updatedBy,
      publishedAt: record.publishedAt,
      publishedBy: record.publishedBy,
    },
  };
}

export async function GET() {
  const authorization = await requirePortalApi();
  if ("response" in authorization) return authorization.response;

  try {
    await ensureDb();
    const records = await getDb().select().from(eventStates).orderBy(desc(eventStates.updatedAt)).limit(50);
    const states = [];
    for (const original of records) {
      let record = original;
      if (!record.shareToken) {
        const shareToken = createShareToken();
        await getDb().update(eventStates).set({ shareToken }).where(eq(eventStates.id, record.id));
        record = { ...record, shareToken };
      }
      states.push(withMetadata(JSON.parse(record.payload), record));
    }
    return Response.json({ states, state: states[0] ?? null });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load event" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const authorization = await requirePortalApi();
  if ("response" in authorization) return authorization.response;

  try {
    const state = await request.json();
    if (!validState(state)) return Response.json({ error: "Invalid event state" }, { status: 400 });
    const persisted = mapTimeAvailabilityToBlocks(persistencePayload(state as unknown as Record<string, unknown>) as AvailabilityState & Record<string, unknown>);
    await ensureDb();
    const existing = await getDb().select().from(eventStates).where(eq(eventStates.id, state.eventId)).limit(1);
    const shareToken = existing[0]?.shareToken ?? createShareToken();
    const payload = JSON.stringify(persisted);
    const now = new Date().toISOString();
    await getDb().insert(eventStates).values({ id: state.eventId, payload, shareToken, updatedBy: authorization.email }).onConflictDoUpdate({
      target: eventStates.id,
      set: { payload, shareToken, updatedBy: authorization.email, updatedAt: now },
    });
    const record = (await getDb().select().from(eventStates).where(eq(eventStates.id, state.eventId)).limit(1))[0];
    return Response.json({ ok: true, state: withMetadata(persisted, record) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to save event" }, { status: 500 });
  }
}
