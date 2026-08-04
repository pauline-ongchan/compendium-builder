import { desc } from "drizzle-orm";
import { mapTimeAvailabilityToBlocks, type AvailabilityState } from "../../availability";
import { ensureDb, getDb } from "../../../db";
import { eventStates } from "../../../db/schema";

export async function GET() {
  try {
    await ensureDb();
    const records = await getDb().select().from(eventStates).orderBy(desc(eventStates.updatedAt)).limit(50);
    const states = records.map((record) => {
      const payload = JSON.parse(record.payload);
      return { ...payload, eventId: payload.eventId ?? record.id };
    });
    return Response.json({ states, state: states[0] ?? null });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load event" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const state = await request.json();
    if (!state || typeof state !== "object" || typeof state.eventId !== "string" || typeof state.eventName !== "string" || !Array.isArray(state.days) || !Array.isArray(state.people)) {
      return Response.json({ error: "Invalid event state" }, { status: 400 });
    }
    mapTimeAvailabilityToBlocks(state as AvailabilityState);
    await ensureDb();
    const payload = JSON.stringify(state);
    const updatedBy =
      request.headers.get("x-relay-user") ??
      request.headers.get("oai-authenticated-user-email") ??
      "relay-director";
    await getDb().insert(eventStates).values({ id: state.eventId, payload, updatedBy }).onConflictDoUpdate({
      target: eventStates.id,
      set: { payload, updatedBy, updatedAt: new Date().toISOString() },
    });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to save event" }, { status: 500 });
  }
}
