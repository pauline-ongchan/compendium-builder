export type AvailabilityStatus = "available" | "conditional" | "unavailable";

export type AvailabilitySlot = {
  key: string;
  start: number;
  end: number;
  label: string;
  endLabel: string;
};

type AvailabilityBlock = { id: string; start: string; end: string };
type AvailabilityDay = {
  id: string;
  blocks: AvailabilityBlock[];
  availabilityStart?: string;
  availabilityEnd?: string;
};
export type AssignmentBlock = AvailabilityBlock & { label: string };
export type PersonAssignment = { id: string; personId: string; blockId: string; start?: string; end?: string };
export type AssignmentSchedule = { blocks: AssignmentBlock[]; assignments: PersonAssignment[] };
type AvailabilityPerson = {
  availability: Record<string, Record<string, AvailabilityStatus>>;
  availabilitySlots?: Record<string, Record<string, boolean>>;
};
export type AvailabilityState = { days: AvailabilityDay[]; people: AvailabilityPerson[] };

const SLOT_MINUTES = 30;

export function eventTimeToMinutes(value: string) {
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([AP]M)?/i);
  if (!match) return Number.NaN;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === "AM" && hour === 12) hour = 0;
  if (meridiem === "PM" && hour !== 12) hour += 12;
  // Relay's schedules commonly omit meridiem. Early hours are treated as PM.
  if (!meridiem && hour >= 1 && hour <= 6) hour += 12;
  return hour * 60 + minute;
}

export function blocksOverlap(first: AssignmentBlock, second: AssignmentBlock) {
  const firstStart = eventTimeToMinutes(first.start);
  const firstEnd = eventTimeToMinutes(first.end);
  const secondStart = eventTimeToMinutes(second.start);
  const secondEnd = eventTimeToMinutes(second.end);
  if (![firstStart, firstEnd, secondStart, secondEnd].every(Number.isFinite)) return false;
  return firstStart < secondEnd && secondStart < firstEnd;
}

export type AssignmentInterval = { start: number; end: number };

export function assignmentInterval(
  assignment: Pick<PersonAssignment, "start" | "end"> | undefined,
  block: Pick<AssignmentBlock, "start" | "end">,
): AssignmentInterval {
  const blockStart = eventTimeToMinutes(block.start);
  const blockEnd = eventTimeToMinutes(block.end);
  const requestedStart = assignment?.start ? eventTimeToMinutes(assignment.start) : Number.NaN;
  const requestedEnd = assignment?.end ? eventTimeToMinutes(assignment.end) : Number.NaN;
  const start = Number.isFinite(requestedStart) ? Math.max(blockStart, requestedStart) : blockStart;
  const end = Number.isFinite(requestedEnd) ? Math.min(blockEnd, requestedEnd) : blockEnd;
  return end > start ? { start, end } : { start: blockStart, end: blockEnd };
}

export function intervalsOverlap(first: AssignmentInterval, second: AssignmentInterval) {
  return first.start < second.end && second.start < first.end;
}

export function findAssignmentConflict(
  day: AssignmentSchedule,
  personId: string,
  blockId: string,
  ignoredAssignmentId?: string,
  requestedInterval?: { start: string; end: string },
) {
  const targetBlock = day.blocks.find((block) => block.id === blockId);
  if (!targetBlock) return undefined;
  const targetInterval = assignmentInterval(requestedInterval, targetBlock);

  for (const assignment of day.assignments) {
    if (assignment.personId !== personId || assignment.id === ignoredAssignmentId) continue;
    const assignedBlock = day.blocks.find((block) => block.id === assignment.blockId);
    if (assignedBlock && intervalsOverlap(targetInterval, assignmentInterval(assignment, assignedBlock))) {
      return { assignment, block: assignedBlock };
    }
  }
  return undefined;
}

function slotKey(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function formatEventTime(minutes: number) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")}${hour < 12 ? "a" : "p"}`;
}

export function getAvailabilitySlots(day: AvailabilityDay): AvailabilitySlot[] {
  const configuredStart = day.availabilityStart ? eventTimeToMinutes(day.availabilityStart) : Number.NaN;
  const configuredEnd = day.availabilityEnd ? eventTimeToMinutes(day.availabilityEnd) : Number.NaN;
  const hasConfiguredWindow = Number.isFinite(configuredStart) && Number.isFinite(configuredEnd) && configuredEnd > configuredStart;
  const starts = hasConfiguredWindow
    ? [configuredStart]
    : day.blocks.map((block) => eventTimeToMinutes(block.start)).filter(Number.isFinite);
  const ends = hasConfiguredWindow
    ? [configuredEnd]
    : day.blocks.map((block) => eventTimeToMinutes(block.end)).filter(Number.isFinite);
  if (!starts.length || !ends.length) return [];
  const start = Math.floor(Math.min(...starts) / SLOT_MINUTES) * SLOT_MINUTES;
  const end = Math.ceil(Math.max(...ends) / SLOT_MINUTES) * SLOT_MINUTES;
  const slots: AvailabilitySlot[] = [];
  for (let minutes = start; minutes < end; minutes += SLOT_MINUTES) {
    slots.push({
      key: slotKey(minutes),
      start: minutes,
      end: minutes + SLOT_MINUTES,
      label: formatEventTime(minutes),
      endLabel: formatEventTime(minutes + SLOT_MINUTES),
    });
  }
  return slots;
}

function overlaps(block: AvailabilityBlock, slot: AvailabilitySlot) {
  const start = eventTimeToMinutes(block.start);
  const end = eventTimeToMinutes(block.end);
  return Number.isFinite(start) && Number.isFinite(end) && slot.start < end && slot.end > start;
}

export function getAvailableAssignmentIntervals(
  block: AvailabilityBlock,
  day: AvailabilityDay,
  freeSlots: Record<string, boolean>,
): AssignmentInterval[] {
  const blockStart = eventTimeToMinutes(block.start);
  const blockEnd = eventTimeToMinutes(block.end);
  const intervals: AssignmentInterval[] = [];
  for (const slot of getAvailabilitySlots(day).filter((item) => overlaps(block, item))) {
    if (freeSlots[slot.key] !== true) continue;
    const start = Math.max(blockStart, slot.start);
    const end = Math.min(blockEnd, slot.end);
    const previous = intervals.at(-1);
    if (previous?.end === start) previous.end = end;
    else intervals.push({ start, end });
  }
  return intervals;
}

export function assignmentAvailabilityFromSlots(
  block: AvailabilityBlock,
  day: AvailabilityDay,
  freeSlots: Record<string, boolean>,
  requestedInterval?: { start?: string; end?: string },
): AvailabilityStatus {
  const interval = assignmentInterval(requestedInterval, block);
  const relevantSlots = getAvailabilitySlots(day).filter((slot) => slot.start < interval.end && slot.end > interval.start);
  if (!relevantSlots.length) return "unavailable";
  const freeCount = relevantSlots.filter((slot) => freeSlots[slot.key] === true).length;
  if (freeCount === relevantSlots.length) return "available";
  if (freeCount === 0) return "unavailable";
  return "conditional";
}

export function slotsFromLegacyAvailability(
  day: AvailabilityDay,
  availability: Record<string, AvailabilityStatus> | undefined,
) {
  return Object.fromEntries(getAvailabilitySlots(day).map((slot) => {
    const statuses = day.blocks.filter((block) => overlaps(block, slot)).map((block) => availability?.[block.id] ?? "available");
    return [slot.key, statuses.length > 0 && statuses.every((status) => status !== "unavailable")];
  }));
}

export function blockAvailabilityFromSlots(
  block: AvailabilityBlock,
  day: AvailabilityDay,
  freeSlots: Record<string, boolean>,
): AvailabilityStatus {
  const relevantSlots = getAvailabilitySlots(day).filter((slot) => overlaps(block, slot));
  if (!relevantSlots.length) return "unavailable";
  const freeCount = relevantSlots.filter((slot) => freeSlots[slot.key] === true).length;
  if (freeCount === relevantSlots.length) return "available";
  if (freeCount === 0) return "unavailable";
  return "conditional";
}

export function mapTimeAvailabilityToBlocks<T extends AvailabilityState>(state: T): T {
  for (const person of state.people) {
    person.availability ??= {};
    person.availabilitySlots ??= {};
    for (const day of state.days) {
      const freeSlots = person.availabilitySlots[day.id];
      if (!freeSlots) continue;
      person.availability[day.id] = Object.fromEntries(day.blocks.map((block) => [
        block.id,
        blockAvailabilityFromSlots(block, day, freeSlots),
      ]));
    }
  }
  return state;
}
