import { desc, eq } from "drizzle-orm";
import { requirePortalApi } from "../../../../auth";
import { ensureDb, getDb } from "../../../../db";
import { eventStates } from "../../../../db/schema";

export async function GET(request: Request) {
  const authorization = await requirePortalApi();
  if ("response" in authorization) return authorization.response;

  try {
    await ensureDb();
    const eventId = new URL(request.url).searchParams.get("event");
    const records = eventId
      ? await getDb().select().from(eventStates).where(eq(eventStates.id, eventId)).limit(1)
      : await getDb().select().from(eventStates).orderBy(desc(eventStates.updatedAt)).limit(1);
    const record = records[0];
    if (!record) return Response.json({ error: "Event not found." }, { status: 404 });
    if (!record.publishedPayload) return Response.json({ error: "This event has not been published yet." }, { status: 409 });

    return Response.json({
      state: {
        ...JSON.parse(record.publishedPayload),
        relayMeta: {
          shareToken: record.shareToken,
          updatedAt: record.publishedAt,
          updatedBy: record.publishedBy,
          publishedAt: record.publishedAt,
          publishedBy: record.publishedBy,
        },
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load the published event" }, { status: 500 });
  }
}
