import { eventTimeToMinutes } from "./availability.ts";

type TimedBlock = { id: string; start: string; end: string };
type TimedAssignment = { id: string; blockId: string };

export function sortAssignmentsByTime<T extends TimedAssignment>(assignments: T[], blocks: TimedBlock[]) {
  const startFor = (assignment: T) => eventTimeToMinutes(blocks.find((block) => block.id === assignment.blockId)?.start ?? "");
  return [...assignments].sort((first, second) => startFor(first) - startFor(second));
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
    const block = blocks.find((item) => item.id === assignment.blockId);
    if (!block) return false;
    return currentMinutes >= eventTimeToMinutes(block.start) && currentMinutes < eventTimeToMinutes(block.end);
  });
  if (active) return { assignment: active, state: "current" };

  const upcoming = ordered.find((assignment) => {
    const block = blocks.find((item) => item.id === assignment.blockId);
    return block ? eventTimeToMinutes(block.start) > currentMinutes : false;
  });
  return upcoming ? { assignment: upcoming, state: "upcoming" } : null;
}
