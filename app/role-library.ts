export type SharedRoleTemplate = {
  id: string;
  name: string;
  description: string;
  color?: string;
  normalizedName?: string;
  revision?: number;
};

export type RoleImportRow = {
  row: number;
  name: string;
  description: string;
  color: string;
  error?: string;
};

export function normalizeRoleName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

export function mergeRoleSources<T extends SharedRoleTemplate>(masterRoles: T[], eventRoles: T[]) {
  const merged = new Map<string, T>();
  for (const role of [...masterRoles, ...eventRoles]) merged.set(role.id, role);
  return Array.from(merged.values()).sort((first, second) => first.name.localeCompare(second.name));
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === "," && !quoted) {
      cells.push(cell.trim());
      cell = "";
    } else cell += character;
  }
  cells.push(cell.trim());
  return cells;
}

export function parseRoleImportCsv(source: string): RoleImportRow[] {
  const lines = source.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]).map((header) => normalizeRoleName(header));
  const nameIndex = headers.findIndex((header) => header === "rolename" || header === "name");
  const descriptionIndex = headers.findIndex((header) => header === "descriptionofresponsibilities" || header === "description" || header === "responsibilities");
  const colorIndex = headers.findIndex((header) => header === "colour" || header === "color");
  if (nameIndex < 0 || descriptionIndex < 0) {
    return [{ row: 1, name: "", description: "", color: "", error: "Use the Role name and Description of responsibilities columns." }];
  }
  return lines.slice(1).map((line, index) => {
    const cells = parseCsvLine(line);
    const name = cells[nameIndex]?.trim() ?? "";
    const description = cells[descriptionIndex]?.trim() ?? "";
    const color = cells[colorIndex]?.trim() ?? "";
    let error = "";
    if (!name) error = "Role name is required.";
    else if (!description) error = "Description of responsibilities is required.";
    else if (color && !/^#[0-9a-f]{6}$/i.test(color)) error = "Colour must use a six-digit hex value, such as #d8d2ef.";
    return { row: index + 2, name, description, color, error: error || undefined };
  });
}

export function similarRoleTemplates(name: string, roles: SharedRoleTemplate[], excludedId?: string) {
  const normalized = normalizeRoleName(name);
  if (!normalized) return [];
  return roles.filter((role) => {
    if (role.id === excludedId) return false;
    const candidate = role.normalizedName || normalizeRoleName(role.name);
    if (candidate === normalized) return true;
    const shorter = candidate.length < normalized.length ? candidate : normalized;
    const longer = candidate.length < normalized.length ? normalized : candidate;
    return shorter.length >= 4 && longer.includes(shorter) && longer.length - shorter.length <= 4;
  });
}

export function replaceRoleTemplateSource(value: unknown, sourceId: string, targetId: string): { value: unknown; changed: boolean } {
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const replaced = replaceRoleTemplateSource(item, sourceId, targetId);
      changed ||= replaced.changed;
      return replaced.value;
    });
    return { value: next, changed };
  }
  if (value && typeof value === "object") {
    let changed = false;
    const next = Object.fromEntries(Object.entries(value).map(([key, item]) => {
      if (key === "templateId" && item === sourceId) {
        changed = true;
        return [key, targetId];
      }
      const replaced = replaceRoleTemplateSource(item, sourceId, targetId);
      changed ||= replaced.changed;
      return [key, replaced.value];
    }));
    return { value: next, changed };
  }
  return { value, changed: false };
}

export function isRoleSnapshotCustomized(role: { name: string; description: string; color?: string }, template?: SharedRoleTemplate) {
  if (!template) return false;
  return role.name !== template.name || role.description !== template.description || role.color !== template.color;
}

export const roleImportCsvTemplate = `Role name,Description of responsibilities,Colour
On-call,"Stay reachable, circulate through active areas, and support teams that need extra hands.",#d8d2ef
`;
