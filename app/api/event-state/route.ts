import { eq } from "drizzle-orm";
import { ensureDb, getDb } from "../../../db";
import { eventStates } from "../../../db/schema";

const EVENT_ID = "productx-2026";

export async function GET() {
  try {
    await ensureDb();
    const [record] = await getDb().select().from(eventStates).where(eq(eventStates.id, EVENT_ID)).limit(1);
    return Response.json({ state: record ? JSON.parse(record.payload) : null });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load event" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const state = await request.json();
    if (!state || typeof state !== "object" || typeof state.eventName !== "string" || !Array.isArray(state.days)) {
      return Response.json({ error: "Invalid event state" }, { status: 400 });
    }
    await ensureDb();
    const payload = JSON.stringify(state);
    const updatedBy = request.headers.get("oai-authenticated-user-email") ?? "local-director";
    await getDb().insert(eventStates).values({ id: EVENT_ID, payload, updatedBy }).onConflictDoUpdate({
      target: eventStates.id,
      set: { payload, updatedBy, updatedAt: new Date().toISOString() },
    });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to save event" }, { status: 500 });
  }
}
