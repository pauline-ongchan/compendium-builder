import { and, eq, gt, sql } from "drizzle-orm";
import { requirePortalApi } from "../../../auth";
import { ensureDb, getDb } from "../../../db";
import { eventAvailability } from "../../../db/schema";

type AvailabilityChange = { personId: string; dayId: string; slotKey: string; available: boolean };
function isChange(value: unknown): value is AvailabilityChange {
  if (!value || typeof value !== "object") return false;
  const change = value as Record<string, unknown>;
  return typeof change.personId === "string" && typeof change.dayId === "string" && typeof change.slotKey === "string" && typeof change.available === "boolean";
}

export async function GET(request: Request) {
  const authorization = await requirePortalApi();
  if ("response" in authorization) return authorization.response;
  try {
    const url = new URL(request.url);
    const eventId = url.searchParams.get("event");
    const since = url.searchParams.get("since");
    if (!eventId) return Response.json({ error: "An event ID is required." }, { status: 400 });
    await ensureDb();
    const conditions = [eq(eventAvailability.eventId, eventId)];
    if (since && !Number.isNaN(Date.parse(since))) conditions.push(gt(eventAvailability.updatedAt, since));
    const changes = await getDb().select().from(eventAvailability).where(and(...conditions));
    return Response.json({ changes, serverTime: new Date().toISOString() }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load availability" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const authorization = await requirePortalApi();
  if ("response" in authorization) return authorization.response;
  try {
    const body = await request.json() as { eventId?: unknown; changes?: unknown };
    if (typeof body.eventId !== "string" || !Array.isArray(body.changes) || !body.changes.length || body.changes.length > 500 || !body.changes.every(isChange)) return Response.json({ error: "Provide an event ID and between 1 and 500 valid availability changes." }, { status: 400 });
    const now = new Date().toISOString();
    const deduplicated = new Map<string, AvailabilityChange>();
    for (const change of body.changes) deduplicated.set(`${change.personId}\u0000${change.dayId}\u0000${change.slotKey}`, change);
    await ensureDb();
    await getDb().insert(eventAvailability).values(Array.from(deduplicated.values()).map((change) => ({ eventId: body.eventId as string, ...change, updatedAt: now, updatedBy: authorization.email }))).onConflictDoUpdate({
      target: [eventAvailability.eventId, eventAvailability.personId, eventAvailability.dayId, eventAvailability.slotKey],
      set: { available: sql`excluded.available`, updatedAt: now, updatedBy: authorization.email },
    });
    return Response.json({ ok: true, saved: deduplicated.size, serverTime: now });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to save availability" }, { status: 500 });
  }
}
