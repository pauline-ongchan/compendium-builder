import { assignmentAvailabilityFromSlots, assignmentInterval, formatEventTime, intervalsOverlap } from "./availability.ts";

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
  kind?: "conflict" | "opportunity";
};

type AvailabilityCheckDay = {
  id: string;
  label: string;
  blocks: { id: string; label: string; start: string; end: string; roles?: unknown[]; requiredRoles?: string[] }[];
  assignments: { personId: string; blockId: string; role: string; start?: string; end?: string }[];
};

type AvailabilityCheckPerson = {
  id: string;
  name: string;
  availability: Record<string, Record<string, string>>;
  availabilitySlots?: Record<string, Record<string, boolean>>;
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
      if (!person || !block) continue;
      const freeSlots = person.availabilitySlots?.[day.id];
      const status = freeSlots
        ? assignmentAvailabilityFromSlots(block, day, freeSlots, assignment)
        : person.availability[day.id]?.[block.id] ?? "unavailable";
      if (status === "available" || (!freeSlots && status !== "unavailable")) continue;
      const interval = assignmentInterval(assignment, block);
      checks.push({
        level: status === "conditional" ? "Partially unavailable" : "Unavailable",
        title: `${person.name} is ${status === "conditional" ? "partially unavailable" : "unavailable"}`,
        detail: `${day.label} · ${block.label} · ${assignment.role}`,
        person: person.name,
        schedule: `${day.label} · ${freeSlots ? `${formatEventTime(interval.start)}–${formatEventTime(interval.end)}` : `${block.start}–${block.end}`} · ${block.label}`,
        role: assignment.role,
        dayId: day.id,
        blockId: block.id,
        personId: person.id,
      });
    }

    for (const block of day.blocks) {
      const hasStaffingRoles = Boolean(block.roles?.length || block.requiredRoles?.length);
      if (!hasStaffingRoles) continue;
      const blockInterval = assignmentInterval(undefined, block);
      for (const person of people) {
        const freeSlots = person.availabilitySlots?.[day.id];
        const status = freeSlots
          ? assignmentAvailabilityFromSlots(block, day, freeSlots)
          : person.availability[day.id]?.[block.id] ?? "unavailable";
        if (status !== "available") continue;

        const personAssignments = day.assignments.filter((assignment) => assignment.personId === person.id);
        if (personAssignments.some((assignment) => assignment.blockId === block.id)) continue;
        const occupied = personAssignments.some((assignment) => {
          const assignedBlock = day.blocks.find((candidate) => candidate.id === assignment.blockId);
          return assignedBlock && intervalsOverlap(blockInterval, assignmentInterval(assignment, assignedBlock));
        });
        if (occupied) continue;

        checks.push({
          kind: "opportunity",
          level: "Available",
          title: `${person.name} is available and unassigned`,
          detail: `${day.label} · ${block.label} · No role assigned`,
          person: person.name,
          schedule: `${day.label} · ${block.start}–${block.end} · ${block.label}`,
          role: "Not assigned",
          dayId: day.id,
          blockId: block.id,
          personId: person.id,
        });
      }
    }
  }
  return checks.sort((first, second) => Number(first.kind === "opportunity") - Number(second.kind === "opportunity"));
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
