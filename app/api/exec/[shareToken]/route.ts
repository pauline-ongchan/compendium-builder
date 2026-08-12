import { eq } from "drizzle-orm";
import { requirePortalApi } from "../../../../auth";
import { publicState } from "../../../public-event-state";
import { ensureDb, getDb } from "../../../../db";
import { eventStates } from "../../../../db/schema";

export async function GET(_request: Request, { params }: { params: Promise<{ shareToken: string }> }) {
  const authorization = await requirePortalApi();
  if ("response" in authorization) return authorization.response;
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
  void request;
  void params;
  return Response.json({ error: "Update availability in People + Availability inside the Relay portal." }, { status: 405 });
}
