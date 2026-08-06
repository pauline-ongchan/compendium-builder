import { asc, eq } from "drizzle-orm";
import { ensureDb, getDb } from "../../../db";
import { roleTemplates } from "../../../db/schema";

export async function GET() {
  try {
    await ensureDb();
    const roles = await getDb().select({ id: roleTemplates.id, name: roleTemplates.name, description: roleTemplates.description }).from(roleTemplates).orderBy(asc(roleTemplates.name));
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
    const updatedBy = request.headers.get("oai-authenticated-user-email") ?? "local-director";
    await getDb().insert(roleTemplates).values({ id: role.id, name: role.name.trim(), description: typeof role.description === "string" ? role.description.trim() : "", updatedBy }).onConflictDoUpdate({
      target: roleTemplates.id,
      set: { name: role.name.trim(), description: typeof role.description === "string" ? role.description.trim() : "", updatedBy, updatedAt: new Date().toISOString() },
    });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to save role template" }, { status: 500 });
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
