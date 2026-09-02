import { desc, eq, isNull } from "drizzle-orm";
import { requirePortalApi } from "../../../../auth";
import { ensureDb, getDb } from "../../../../db";
import { eventStates, rosterGroups, rosterPeople } from "../../../../db/schema";

export async function GET(request: Request) {
  const authorization = await requirePortalApi();
  if ("response" in authorization) return authorization.response;

  try {
    await ensureDb();
    const eventId = new URL(request.url).searchParams.get("event");
    const records = eventId
      ? await getDb().select().from(eventStates).where(eq(eventStates.id, eventId)).limit(1)
      : await getDb().select().from(eventStates).where(isNull(eventStates.archivedAt)).orderBy(desc(eventStates.updatedAt)).limit(1);
    const record = records[0];
    if (!record) return Response.json({ error: "Event not found." }, { status: 404 });
    if (record.archivedAt) return Response.json({ error: "Archived events are unavailable in Exec View. Restore the event to open it." }, { status: 410 });
    if (!record.publishedPayload) return Response.json({ error: "This event has not been published yet." }, { status: 409 });

    const state = JSON.parse(record.publishedPayload) as Record<string, unknown> & { people?: Array<Record<string, unknown>>; groups?: unknown[] };
    const [groups, people] = await Promise.all([getDb().select().from(rosterGroups), getDb().select().from(rosterPeople)]);
    if (people.length) {
      const existingPeople = new Map((state.people ?? []).map((person) => [person.id, person]));
      const groupNames = new Map(groups.map((group) => [group.id, group.name]));
      state.groups = groups;
      state.people = people.map((person) => ({
        ...(existingPeople.get(person.id) ?? {}), id: person.id, name: person.name, initials: person.initials, phone: person.phone, email: person.email, color: person.color,
        groupIds: person.groupId ? [person.groupId] : [], team: person.groupId ? groupNames.get(person.groupId) ?? "Unassigned" : "Unassigned", preferences: JSON.parse(person.preferences || "[]"),
      }));
    }
    return Response.json({
      state: {
        ...state,
        relayMeta: {
          updatedAt: record.publishedAt,
          updatedBy: record.publishedBy,
          publishedAt: record.publishedAt,
          publishedBy: record.publishedBy,
          archivedAt: null,
          archivedBy: null,
        },
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load the published event" }, { status: 500 });
  }
}
