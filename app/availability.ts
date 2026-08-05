export type AvailabilityStatus = "available" | "conditional" | "unavailable";

export type AvailabilitySlot = {
  key: string;
  start: number;
  end: number;
  label: string;
  endLabel: string;
};

type AvailabilityBlock = { id: string; start: string; end: string };
type AvailabilityDay = { id: string; blocks: AvailabilityBlock[] };
export type AssignmentBlock = AvailabilityBlock & { label: string };
export type PersonAssignment = { id: string; personId: string; blockId: string };
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

export function findAssignmentConflict(
  day: AssignmentSchedule,
  personId: string,
  blockId: string,
  ignoredAssignmentId?: string,
) {
  const targetBlock = day.blocks.find((block) => block.id === blockId);
  if (!targetBlock) return undefined;

  for (const assignment of day.assignments) {
    if (assignment.personId !== personId || assignment.id === ignoredAssignmentId) continue;
    const assignedBlock = day.blocks.find((block) => block.id === assignment.blockId);
    if (assignedBlock && blocksOverlap(targetBlock, assignedBlock)) {
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
  const starts = day.blocks.map((block) => eventTimeToMinutes(block.start)).filter(Number.isFinite);
  const ends = day.blocks.map((block) => eventTimeToMinutes(block.end)).filter(Number.isFinite);
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

export function slotsFromLegacyAvailability(
  day: AvailabilityDay,
  availability: Record<string, AvailabilityStatus> | undefined,
) {
  return Object.fromEntries(getAvailabilitySlots(day).map((slot) => {
    const statuses = day.blocks.filter((block) => overlaps(block, slot)).map((block) => availability?.[block.id] ?? "available");
    return [slot.key, statuses.every((status) => status !== "unavailable")];
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
