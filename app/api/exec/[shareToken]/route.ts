import { and, eq } from "drizzle-orm";
import { applyUpdate, isUpdate, publicState } from "../../../public-event-state";
import { ensureDb, getDb } from "../../../../db";
import { eventStates } from "../../../../db/schema";

export async function GET(_request: Request, { params }: { params: Promise<{ shareToken: string }> }) {
  try {
    const { shareToken } = await params;
    await ensureDb();
    const record = (await getDb().select().from(eventStates).where(eq(eventStates.shareToken, shareToken)).limit(1))[0];
    if (!record) return Response.json({ error: "This event link is invalid or has been replaced." }, { status: 404 });
    if (!record.publishedPayload) return Response.json({ error: "This event has not been published yet." }, { status: 409 });
    return Response.json({ state: publicState(record.publishedPayload) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load the published event" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ shareToken: string }> }) {
  try {
    const [{ shareToken }, update] = await Promise.all([params, request.json()]);
    if (!isUpdate(update)) return Response.json({ error: "Invalid availability update" }, { status: 400 });
    await ensureDb();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const record = (await getDb().select().from(eventStates).where(eq(eventStates.shareToken, shareToken)).limit(1))[0];
      if (!record) return Response.json({ error: "This event link is invalid or has been replaced." }, { status: 404 });
      if (!record.publishedPayload) return Response.json({ error: "This event has not been published yet." }, { status: 409 });
      const payload = applyUpdate(record.payload, update);
      const publishedPayload = applyUpdate(record.publishedPayload, update);
      const changed = await getDb().update(eventStates).set({ payload, publishedPayload, updatedAt: new Date().toISOString(), updatedBy: `exec:${update.personId}` }).where(and(eq(eventStates.id, record.id), eq(eventStates.payload, record.payload))).returning({ id: eventStates.id });
      if (changed.length) return Response.json({ ok: true });
    }
    return Response.json({ error: "The event changed while saving. Please try again." }, { status: 409 });
  } catch (error) {
    const status = error instanceof Error && /no longer available/.test(error.message) ? 409 : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Unable to update availability" }, { status });
  }
}
