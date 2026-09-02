import { asc, inArray } from "drizzle-orm";
import { requirePortalApi } from "../../../auth";
import { ensureDb, getDb } from "../../../db";
import { rosterGroups, rosterPeople } from "../../../db/schema";

type RosterGroupInput = { id: string; name: string; color?: string };
type RosterPersonInput = { id: string; name: string; initials?: string; phone?: string; email?: string; color?: string; groupIds?: string[]; preferences?: string[] };

function validColor(value: unknown) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : "#d8d2ef";
}

export async function GET() {
  const authorization = await requirePortalApi();
  if ("response" in authorization) return authorization.response;
  try {
    await ensureDb();
    const [groups, records] = await Promise.all([
      getDb().select().from(rosterGroups).orderBy(asc(rosterGroups.name)),
      getDb().select().from(rosterPeople).orderBy(asc(rosterPeople.name)),
    ]);
    const groupNames = new Map(groups.map((group) => [group.id, group.name]));
    return Response.json({ groups, people: records.map((person) => ({
      id: person.id, name: person.name, initials: person.initials, phone: person.phone, email: person.email, color: person.color,
      groupIds: person.groupId ? [person.groupId] : [], team: person.groupId ? groupNames.get(person.groupId) ?? "Unassigned" : "Unassigned",
      preferences: JSON.parse(person.preferences || "[]"),
    })) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load the universal roster" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const authorization = await requirePortalApi();
  if ("response" in authorization) return authorization.response;
  try {
    const body = await request.json() as { groups?: unknown; people?: unknown };
    if (!Array.isArray(body.groups) || !Array.isArray(body.people)) return Response.json({ error: "Roster groups and people are required." }, { status: 400 });
    const groups = body.groups as RosterGroupInput[];
    const people = body.people as RosterPersonInput[];
    if (groups.some((group) => typeof group.id !== "string" || typeof group.name !== "string" || !group.name.trim()) || people.some((person) => typeof person.id !== "string" || typeof person.name !== "string" || !person.name.trim())) return Response.json({ error: "Every roster entry needs a stable ID and name." }, { status: 400 });
    await ensureDb();
    const db = getDb();
    for (const group of groups) await db.insert(rosterGroups).values({ id: group.id, name: group.name.trim(), color: validColor(group.color), updatedBy: authorization.email }).onConflictDoUpdate({ target: rosterGroups.id, set: { name: group.name.trim(), color: validColor(group.color), updatedBy: authorization.email, updatedAt: new Date().toISOString() } });
    for (const person of people) await db.insert(rosterPeople).values({
      id: person.id, name: person.name.trim(), initials: typeof person.initials === "string" ? person.initials : "", phone: typeof person.phone === "string" ? person.phone.trim() : "", email: typeof person.email === "string" ? person.email.trim() : "", color: validColor(person.color),
      groupId: Array.isArray(person.groupIds) && typeof person.groupIds[0] === "string" ? person.groupIds[0] : null,
      preferences: JSON.stringify(Array.isArray(person.preferences) ? person.preferences.filter((item): item is string => typeof item === "string") : []), updatedBy: authorization.email,
    }).onConflictDoUpdate({ target: rosterPeople.id, set: { name: person.name.trim(), initials: person.initials ?? "", phone: person.phone?.trim() ?? "", email: person.email?.trim() ?? "", color: validColor(person.color), groupId: person.groupIds?.[0] ?? null, preferences: JSON.stringify(person.preferences ?? []), updatedBy: authorization.email, updatedAt: new Date().toISOString() } });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to save the universal roster" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const authorization = await requirePortalApi();
  if ("response" in authorization) return authorization.response;
  try {
    const body = await request.json() as { personIds?: unknown; groupIds?: unknown };
    const personIds = Array.isArray(body.personIds) ? body.personIds.filter((id): id is string => typeof id === "string") : [];
    const groupIds = Array.isArray(body.groupIds) ? body.groupIds.filter((id): id is string => typeof id === "string") : [];
    if (!personIds.length && !groupIds.length) return Response.json({ error: "Specify the roster entries to delete." }, { status: 400 });
    await ensureDb();
    if (personIds.length) await getDb().delete(rosterPeople).where(inArray(rosterPeople.id, personIds));
    if (groupIds.length) await getDb().delete(rosterGroups).where(inArray(rosterGroups.id, groupIds));
    return Response.json({ ok: true, deletedPeople: personIds, deletedGroups: groupIds });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to delete roster entries" }, { status: 500 });
  }
}
