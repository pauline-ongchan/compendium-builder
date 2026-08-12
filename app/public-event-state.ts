import { getAvailabilitySlots, mapTimeAvailabilityToBlocks, type AvailabilityState, type AvailabilityStatus } from "./availability.ts";

export type PublicUpdate =
  | { kind: "availability"; personId: string; dayId: string; slotKey: string; value: boolean }
  | { kind: "prepAvailability"; personId: string; sessionId: string; value: AvailabilityStatus };

export function publicState(payload: string) {
  const state = JSON.parse(payload) as Record<string, unknown> & { people?: Array<Record<string, unknown>> };
  return {
    ...state,
    people: (state.people ?? []).map((person) => ({ ...person, preferences: [], privateNote: "", phone: "", email: "" })),
  };
}

export function isUpdate(value: unknown): value is PublicUpdate {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  if (typeof body.personId !== "string") return false;
  if (body.kind === "availability") return typeof body.dayId === "string" && /^\d{2}:\d{2}$/.test(String(body.slotKey)) && typeof body.value === "boolean";
  return body.kind === "prepAvailability" && typeof body.sessionId === "string" && ["available", "conditional", "unavailable"].includes(String(body.value));
}

export function applyUpdate(payload: string, update: PublicUpdate) {
  const state = JSON.parse(payload) as {
    days: AvailabilityState["days"];
    prepSessions?: Array<{ id: string }>;
    people: Array<Record<string, unknown> & {
      id: string;
      availability: Record<string, Record<string, AvailabilityStatus>>;
      availabilitySlots?: Record<string, Record<string, boolean>>;
      prepAvailability?: Record<string, AvailabilityStatus>;
    }>;
  };
  const person = state.people.find((candidate) => candidate.id === update.personId);
  if (!person) throw new Error("That roster member is no longer available.");
  if (update.kind === "availability") {
    const day = state.days.find((candidate) => candidate.id === update.dayId);
    if (!day) throw new Error("That event day is no longer available.");
    if (!getAvailabilitySlots(day).some((slot) => slot.key === update.slotKey)) throw new Error("That availability time is no longer available.");
    person.availabilitySlots ??= {};
    person.availabilitySlots[update.dayId] ??= {};
    person.availabilitySlots[update.dayId][update.slotKey] = update.value;
    mapTimeAvailabilityToBlocks(state);
  } else {
    if (!state.prepSessions?.some((session) => session.id === update.sessionId)) throw new Error("That prep session is no longer available.");
    person.prepAvailability ??= {};
    person.prepAvailability[update.sessionId] = update.value;
  }
  return JSON.stringify(state);
}
