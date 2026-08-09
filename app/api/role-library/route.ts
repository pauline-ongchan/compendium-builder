import { asc, eq, isNull, sql } from "drizzle-orm";
import { ensureDb, getDb } from "../../../db";
import { eventStates, roleTemplates } from "../../../db/schema";
import { normalizeRoleName, replaceRoleTemplateSource } from "../../role-library";

const roleFields = {
  id: roleTemplates.id,
  name: roleTemplates.name,
  normalizedName: roleTemplates.normalizedName,
  description: roleTemplates.description,
  color: roleTemplates.color,
  revision: roleTemplates.revision,
};

export async function GET() {
  try {
    await ensureDb();
    const roles = await getDb().select(roleFields).from(roleTemplates).where(isNull(roleTemplates.mergedIntoId)).orderBy(asc(roleTemplates.name));
    return Response.json({ roles });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load role library" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const role = await request.json();
    if (!role || typeof role.id !== "string" || typeof role.name !== "string" || !role.name.trim()) {
      return Response.json({ error: "Invalid role template" }, { status: 400 });
    }
    await ensureDb();
    const db = getDb();
    const normalizedName = normalizeRoleName(role.name);
    const matches = await db.select(roleFields).from(roleTemplates).where(isNull(roleTemplates.mergedIntoId));
    const duplicate = matches.find((candidate) => candidate.id !== role.id && candidate.normalizedName === normalizedName);
    if (duplicate && !role.replaceExisting) {
      return Response.json({ error: `A role named ${duplicate.name} already exists.`, existing: duplicate }, { status: 409 });
    }
    const targetId = duplicate?.id ?? role.id;
    const updatedBy = request.headers.get("oai-authenticated-user-email") ?? "local-director";
    const color = typeof role.color === "string" && /^#[0-9a-f]{6}$/i.test(role.color) ? role.color : "#d8d2ef";
    const [saved] = await db.insert(roleTemplates).values({
      id: targetId,
      name: role.name.trim(),
      normalizedName,
      description: typeof role.description === "string" ? role.description.trim() : "",
      color,
      revision: 1,
      updatedBy,
    }).onConflictDoUpdate({
      target: roleTemplates.id,
      set: {
        name: role.name.trim(),
        normalizedName,
        description: typeof role.description === "string" ? role.description.trim() : "",
        color,
        revision: sql`${roleTemplates.revision} + 1`,
        updatedBy,
        updatedAt: new Date().toISOString(),
      },
    }).returning(roleFields);
    return Response.json({ ok: true, role: saved, replacedExisting: Boolean(duplicate) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save role template";
    return Response.json({ error: message }, { status: message.includes("equivalent active role") ? 409 : 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (body?.action !== "merge" || typeof body.sourceId !== "string" || typeof body.targetId !== "string" || body.sourceId === body.targetId) {
      return Response.json({ error: "A source role and surviving role are required." }, { status: 400 });
    }
    await ensureDb();
    const db = getDb();
    const roles = await db.select(roleFields).from(roleTemplates).where(isNull(roleTemplates.mergedIntoId));
    const source = roles.find((role) => role.id === body.sourceId);
    const target = roles.find((role) => role.id === body.targetId);
    if (!source || !target) return Response.json({ error: "One of these roles is no longer active." }, { status: 404 });

    let updatedEvents = 0;
    const states = await db.select({ id: eventStates.id, payload: eventStates.payload }).from(eventStates);
    for (const state of states) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(state.payload);
      } catch {
        // Preserve malformed legacy payloads rather than risking destructive changes.
        continue;
      }
      const replaced = replaceRoleTemplateSource(parsed, source.id, target.id);
      if (!replaced.changed) continue;
      await db.update(eventStates).set({ payload: JSON.stringify(replaced.value), updatedAt: new Date().toISOString() }).where(eq(eventStates.id, state.id));
      updatedEvents += 1;
    }
    await db.update(roleTemplates).set({ mergedIntoId: target.id, updatedAt: new Date().toISOString() }).where(eq(roleTemplates.id, source.id));
    return Response.json({ ok: true, survivor: target, merged: source, updatedEvents });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to merge role templates" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return Response.json({ error: "Role template ID is required" }, { status: 400 });
    await ensureDb();
    await getDb().delete(roleTemplates).where(eq(roleTemplates.id, id));
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to delete role template" }, { status: 500 });
  }
}
