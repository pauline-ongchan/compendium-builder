import { assignmentInterval } from "./availability.ts";

type TimedBlock = { id: string; start: string; end: string };
type TimedAssignment = { id: string; blockId: string; start?: string; end?: string };

function rangeFor<T extends TimedAssignment>(assignment: T, blocks: TimedBlock[]) {
  const block = blocks.find((item) => item.id === assignment.blockId);
  return block ? assignmentInterval(assignment, block) : { start: Number.MAX_SAFE_INTEGER, end: Number.MAX_SAFE_INTEGER };
}

export function sortAssignmentsByTime<T extends TimedAssignment>(assignments: T[], blocks: TimedBlock[]) {
  return [...assignments].sort((first, second) => rangeFor(first, blocks).start - rangeFor(second, blocks).start);
}

export type MergedExecAssignment<T extends TimedAssignment> = {
  assignment: T;
  assignments: T[];
  start: number;
  end: number;
};

export function mergeConsecutiveAssignments<T extends TimedAssignment & { role: string }>(
  assignments: T[],
  blocks: TimedBlock[],
): MergedExecAssignment<T>[] {
  const merged: MergedExecAssignment<T>[] = [];
  for (const assignment of sortAssignmentsByTime(assignments, blocks)) {
    const range = rangeFor(assignment, blocks);
    const previous = merged.at(-1);
    if (previous && previous.assignment.blockId === assignment.blockId && previous.assignment.role === assignment.role && previous.end === range.start) {
      previous.assignments.push(assignment);
      previous.end = range.end;
    } else {
      merged.push({ assignment, assignments: [assignment], start: range.start, end: range.end });
    }
  }
  return merged;
}

export type AssignmentMoment<T extends TimedAssignment> = {
  assignment: T;
  state: "current" | "upcoming";
};

export function assignmentForMoment<T extends TimedAssignment>(
  assignments: T[],
  blocks: TimedBlock[],
  now = new Date(),
): AssignmentMoment<T> | null {
  const ordered = sortAssignmentsByTime(assignments, blocks);
  if (!ordered.length) return null;

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const active = ordered.find((assignment) => {
    const range = rangeFor(assignment, blocks);
    return currentMinutes >= range.start && currentMinutes < range.end;
  });
  if (active) return { assignment: active, state: "current" };

  const upcoming = ordered.find((assignment) => {
    return rangeFor(assignment, blocks).start > currentMinutes;
  });
  return upcoming ? { assignment: upcoming, state: "upcoming" } : null;
}
