import { desc, eq } from "drizzle-orm";
import { requirePortalApi } from "../../../auth";
import { mapTimeAvailabilityToBlocks, type AvailabilityState } from "../../availability";
import { ensureDb, getDb } from "../../../db";
import { eventStates } from "../../../db/schema";

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
      updatedAt: record.updatedAt,
      updatedBy: record.updatedBy,
      publishedAt: record.publishedAt,
      publishedBy: record.publishedBy,
      archivedAt: record.archivedAt,
      archivedBy: record.archivedBy,
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
    const archivedStates = [];
    for (const record of records) {
      const state = withMetadata(JSON.parse(record.payload), record);
      if (record.archivedAt) archivedStates.push(state);
      else states.push(state);
    }
    return Response.json({ states, archivedStates, state: states[0] ?? null });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load event" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const authorization = await requirePortalApi();
  if ("response" in authorization) return authorization.response;

  try {
    const body = await request.json() as { eventId?: unknown; archived?: unknown };
    if (typeof body.eventId !== "string" || typeof body.archived !== "boolean") {
      return Response.json({ error: "An event ID and archive status are required" }, { status: 400 });
    }
    await ensureDb();
    const existing = await getDb().select().from(eventStates).where(eq(eventStates.id, body.eventId)).limit(1);
    if (!existing[0]) return Response.json({ error: "Event not found" }, { status: 404 });
    const archivedAt = body.archived ? new Date().toISOString() : null;
    const archivedBy = body.archived ? authorization.email : null;
    await getDb().update(eventStates).set({ archivedAt, archivedBy }).where(eq(eventStates.id, body.eventId));
    const record = (await getDb().select().from(eventStates).where(eq(eventStates.id, body.eventId)).limit(1))[0];
    return Response.json({ ok: true, state: withMetadata(JSON.parse(record.payload), record) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to update event archive status" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const authorization = await requirePortalApi();
  if ("response" in authorization) return authorization.response;

  try {
    const eventId = new URL(request.url).searchParams.get("event");
    if (!eventId) return Response.json({ error: "An event ID is required" }, { status: 400 });
    await ensureDb();
    const existing = await getDb().select({ id: eventStates.id }).from(eventStates).where(eq(eventStates.id, eventId)).limit(1);
    if (!existing[0]) return Response.json({ error: "Event not found" }, { status: 404 });
    await getDb().delete(eventStates).where(eq(eventStates.id, eventId));
    return Response.json({ ok: true, eventId });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to delete event" }, { status: 500 });
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
    const payload = JSON.stringify(persisted);
    const now = new Date().toISOString();
    await getDb().insert(eventStates).values({ id: state.eventId, payload, updatedBy: authorization.email }).onConflictDoUpdate({
      target: eventStates.id,
      set: { payload, updatedBy: authorization.email, updatedAt: now },
    });
    const record = (await getDb().select().from(eventStates).where(eq(eventStates.id, state.eventId)).limit(1))[0];
    return Response.json({ ok: true, state: withMetadata(persisted, record) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to save event" }, { status: 500 });
  }
}
