export type ScheduleCheck = {
  level: string;
  title: string;
  detail: string;
  person?: string;
  schedule?: string;
  role?: string;
  dayId?: string;
  blockId?: string;
  personId?: string;
};

type AvailabilityCheckDay = {
  id: string;
  label: string;
  blocks: { id: string; label: string; start: string; end: string }[];
  assignments: { personId: string; blockId: string; role: string }[];
};

type AvailabilityCheckPerson = {
  id: string;
  name: string;
  availability: Record<string, Record<string, string>>;
};

export function getAssignmentAvailabilityChecks(
  days: AvailabilityCheckDay[],
  people: AvailabilityCheckPerson[],
): ScheduleCheck[] {
  const checks: ScheduleCheck[] = [];
  for (const day of days) {
    for (const assignment of day.assignments) {
      const person = people.find((item) => item.id === assignment.personId);
      const block = day.blocks.find((item) => item.id === assignment.blockId);
      if (!person || !block || person.availability[day.id]?.[block.id] !== "unavailable") continue;
      checks.push({
        level: "Unavailable",
        title: `${person.name} is unavailable`,
        detail: `${day.label} · ${block.label} · ${assignment.role}`,
        person: person.name,
        schedule: `${day.label} · ${block.start}–${block.end} · ${block.label}`,
        role: assignment.role,
        dayId: day.id,
        blockId: block.id,
        personId: person.id,
      });
    }
  }
  return checks;
}

export function getScheduleChecksViewState(
  checks: ScheduleCheck[],
  loading: boolean,
  error: string,
) {
  return {
    phase: loading ? "loading" as const : checks.length ? "ready" as const : "empty" as const,
    checks,
    error,
  };
}
