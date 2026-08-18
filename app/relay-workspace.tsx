"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { signOut } from "next-auth/react";
import {
  assignmentAvailabilityFromSlots,
  assignmentInterval,
  eventTimeToMinutes,
  findAssignmentConflict,
  formatEventTime,
  getAvailableAssignmentIntervals,
  getAvailabilitySlots,
  mapTimeAvailabilityToBlocks,
  slotsFromLegacyAvailability,
  type AvailabilityStatus,
} from "./availability";
import { publishEventState } from "./event-state-client";
import { parseScheduleTable } from "./schedule-import";
import { getAssignmentAvailabilityChecks, getScheduleChecksViewState, type ScheduleCheck } from "./schedule-checks";
import { getPublicationStatus } from "./publication-status";
import { validateDayCount } from "./event-setup";
import { moveRoleOptionIndex, nextRoleColor, roleColor } from "./role-presentation";
import { isRoleSnapshotCustomized, normalizeRoleName, parseRoleImportCsv, roleImportCsvTemplate, similarRoleTemplates, type RoleImportRow, type SharedRoleTemplate } from "./role-library";
import { assignmentForMoment, mergeConsecutiveAssignments, sortAssignmentsByTime } from "./exec-view";

type Section = "schedule" | "prep" | "people" | "roles" | "judging" | "resources" | "settings";
const WORKSPACE_MODE_KEY = "relay:v1:workspace-mode";
const execDayStorageKey = (eventId: string) => `relay:v1:exec-day:${eventId}`;

function setExecViewUrl(active: boolean, eventId?: string) {
  const url = new URL(window.location.href);
  if (active) {
    url.searchParams.set("view", "exec");
    if (eventId) url.searchParams.set("event", eventId);
  } else url.searchParams.delete("view");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}
type RelayMeta = { shareToken: string | null; updatedAt: string | null; updatedBy: string | null; publishedAt: string | null; publishedBy: string | null };

type BlockLink = { id: string; label: string; url: string };
type RoleTemplate = SharedRoleTemplate;
type BlockRole = {
  id: string;
  templateId: string;
  templateRevision?: number;
  customized?: boolean;
  name: string;
  description: string;
  leadPersonId: string;
  color?: string;
};

type Person = {
  id: string;
  name: string;
  initials: string;
  team: string;
  color: string;
  preferences: string[];
  privateNote: string;
  phone: string;
  email: string;
  groupIds: string[];
  availability: Record<string, Record<string, AvailabilityStatus>>;
  availabilitySlots?: Record<string, Record<string, boolean>>;
  prepAvailability: Record<string, AvailabilityStatus>;
};

type ExecGroup = { id: string; name: string; color: string };
type ImportantContact = { id: string; name: string; role: string; phone: string };
type ConfirmationRequest = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "warning" | "danger";
};
type ShareLink = { title: string; message: string; url: string };

type EventBlock = {
  id: string;
  label: string;
  short: string;
  start: string;
  end: string;
  location: string;
  color: string;
  requiredRoles?: string[];
  roles?: BlockRole[];
  links?: BlockLink[];
};

type Assignment = {
  id: string;
  personId: string;
  blockId: string;
  blockRoleId: string;
  role: string;
  lead: string;
  leadPersonId?: string;
  description: string;
  color: string;
  customized?: boolean;
  start?: string;
  end?: string;
};

type AssignmentIntervalEditor = {
  blockId: string;
  personId: string;
  blockRoleId: string;
  assignmentId?: string;
};

type EventDay = {
  id: string;
  label: string;
  date: string;
  blocks: EventBlock[];
  assignments: Assignment[];
};

type Resource = { id: string; label: string; group: string; url: string; dayOf: boolean };
type PrepSession = { id: string; label: string; date: string; start: string; end: string; location: string };
type PrepTask = { id: string; label: string; done: boolean; ownerPersonId: string; sessionId: string; notes: string };
type JudgingRoom = {
  id: string;
  room: string;
  judges: string;
  staff: string;
  slots: { time: string; team: string; status: "Waiting" | "Presenting" | "Done" | "Dropped" }[];
};

type EventState = {
  eventId: string;
  eventName: string;
  eventType: string;
  dateRange: string;
  venue: string;
  publishedAt: string;
  draftChanges: number;
  prepEnabled: boolean;
  judgingEnabled: boolean;
  people: Person[];
  days: EventDay[];
  resources: Resource[];
  prepSessions: PrepSession[];
  prepTasks: PrepTask[];
  roleLibrary: RoleTemplate[];
  groups: ExecGroup[];
  contacts: ImportantContact[];
  judgingRooms: JudgingRoom[];
  relayMeta?: RelayMeta;
};

const roleDescriptions: Record<string, string> = {
  Materials: "Bring event materials from the club room, confirm quantities, and stage each item at its destination.",
  "Room Scout": "Check rooms, signage, furniture, cleanliness, and accessibility before participants arrive.",
  Hype: "Set the tone, welcome participants, and model the energy expected in the room.",
  "Participant Care": "Welcome participants, spot anyone who looks lost, and connect them to the right person.",
  Media: "Capture key moments, speakers, participants, partners, and behind-the-scenes operations.",
  "Food Team": "Receive, stage, label, serve, and clean up food while protecting dietary requirements.",
  "Dev Support": "Monitor event tools, help users, and troubleshoot issues without interrupting the program flow.",
  "On Call": "Stay reachable, circulate through active areas, and reinforce teams that need extra hands.",
  Timekeeper: "Keep presentations on time and give clear, consistent warnings before the hard stop.",
  "Judge Usher": "Welcome judges, confirm their room, brief the flow, and remain available for questions.",
  "Usher Hackers": "Move teams into the correct room at the correct time and keep corridors clear.",
  "Vibe Check": "Support the room, engage quiet participants, and flag wellbeing or experience issues to the lead.",
  Sweep: "Reset rooms, collect materials, remove signage, and confirm the venue is left clean.",
};

const standardResourceTemplate = [
  ["Master Doc", "Core", true], ["Figma", "Core", false], ["Opening Slides", "Core", true], ["Closing Slides", "Core", true], ["Spotify Playlist", "Core", true], ["Discord Invite Link", "Core", true], ["Discord Reminder Sheet", "Core", false], ["AV Instruction Sheet", "Core", true],
  ["Participant Registration", "Participants", false], ["[DRAFT] Participant Registration", "Participants", false], ["Reminder Email Template", "Participants", false], ["Registration Confirmation Google Form", "Participants", false], ["Registration Confirmation", "Participants", false], ["Participant Package", "Participants", true], ["Thank You Package", "Participants", false], ["Team & Judges Room Assignments", "Participants", true],
  ["Partner Compendium + Check-In", "Partners", true],
  ["Attendee Feedback Form", "Feedback", true], ["Partner Feedback Form", "Feedback", false],
  ["Budget", "Finance", false],
] as const;

function resourceTemplateItems() {
  return standardResourceTemplate.map(([label, group, dayOf], index): Resource => ({ id: `resource-template-${index + 1}`, label, group, dayOf, url: "" }));
}

const prepSessionsSeed: PrepSession[] = [
  { id: "prep-pack", label: "Supply packing", date: "2026-03-18", start: "6:00 PM", end: "8:00 PM", location: "Club room" },
  { id: "prep-walkthrough", label: "Venue walkthrough", date: "2026-03-19", start: "5:00 PM", end: "7:00 PM", location: "Henry Angus Building" },
];

function roleTemplateId(name: string) {
  return `role-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "untitled"}`;
}

const builtInRoleTemplates: RoleTemplate[] = Object.entries(roleDescriptions).map(([name, description]) => ({ id: roleTemplateId(name), name, description, color: roleColor(name) }));

const peopleBase = [
  ["angela", "Angela", "AN", "Experience", "#ff8066", ["Participant Care", "Food Team"]],
  ["benny", "Benny", "BE", "Development", "#7f99ff", ["Dev Support", "On Call"]],
  ["cheryl", "Cheryl", "CH", "Experience", "#dfef79", ["Hype", "Vibe Check"]],
  ["dane", "Dane", "DA", "Partnerships", "#b9a7ff", ["Judge Usher", "Timekeeper"]],
  ["eliana", "Eliana", "EL", "Marketing", "#f8bb65", ["Registration", "Media"]],
  ["ethan", "Ethan H", "EH", "Development", "#69c7b6", ["AV", "Dev Support"]],
  ["gautham", "Gautham", "GA", "Experience", "#f09c71", ["Materials", "On Call"]],
  ["grace", "Grace", "GR", "Finance", "#92c9ff", ["Timekeeper", "Food Team"]],
  ["isaac", "Isaac", "IS", "Development", "#73a2ee", ["Dev Support", "Discord Mod"]],
  ["jay", "Jay", "JA", "Experience", "#f1d26c", ["AV", "Hype"]],
  ["lillian", "Lillian", "LI", "Experience", "#ec91bd", ["Usher Hackers", "Food Team"]],
  ["pauline", "Pauline", "PA", "Co-President", "#e7f16c", ["MC", "Timekeeper"]],
] as const;

const day1Blocks: EventBlock[] = [
  { id: "d1-setup", label: "Set-up", short: "SET", start: "7:30", end: "9:15", location: "HA 098", color: "#f3c8cf", requiredRoles: ["Materials", "Room Scout"] },
  { id: "d1-checkin", label: "Check-in", short: "IN", start: "9:15", end: "10:00", location: "HA 098", color: "#d8d2ef", requiredRoles: ["Participant Care", "Registration"] },
  { id: "d1-kickoff", label: "Kickoff", short: "GO", start: "10:00", end: "11:30", location: "HA 098", color: "#c5dfd7", requiredRoles: ["Hype", "AV", "Media"] },
  { id: "d1-lunch", label: "Lunch", short: "LUN", start: "11:30", end: "12:30", location: "HA 291", color: "#f7e0a7", requiredRoles: ["Food Team", "Usher"] },
  { id: "d1-build", label: "Hacking", short: "BLD", start: "12:30", end: "4:30", location: "Hacking rooms", color: "#f3d9bc", requiredRoles: ["On Call", "Dev Support", "Discord Mod"] },
  { id: "d1-dinner", label: "Dinner + game", short: "DIN", start: "4:30", end: "6:30", location: "HA 291 / 492", color: "#f0c6b9", requiredRoles: ["Food Team", "Game Mod"] },
  { id: "d1-close", label: "Close", short: "END", start: "6:30", end: "9:00", location: "All rooms", color: "#d8e8d2", requiredRoles: ["On Call", "Sweep"] },
];

const day2Blocks: EventBlock[] = [
  { id: "d2-setup", label: "Set-up", short: "SET", start: "7:30", end: "9:00", location: "HA 291", color: "#f3c8cf", requiredRoles: ["Materials", "Room Scout"] },
  { id: "d2-checkin", label: "Breakfast", short: "IN", start: "9:00", end: "10:00", location: "HA 291", color: "#d8d2ef", requiredRoles: ["Participant Care", "Food Team"] },
  { id: "d2-hacking", label: "Hacking", short: "BLD", start: "10:00", end: "12:30", location: "Hacking rooms", color: "#f3d9bc", requiredRoles: ["On Call", "Dev Support"] },
  { id: "d2-lunch", label: "Lunch", short: "LUN", start: "12:30", end: "1:30", location: "Birmingham", color: "#c8e1ef", requiredRoles: ["Food Team", "Judge Usher"] },
  { id: "d2-judging", label: "Round 1 judging", short: "JDG", start: "1:30", end: "3:00", location: "HA 241–296", color: "#cfe2c8", requiredRoles: ["Timekeeper", "Usher Hackers", "Dev Support"] },
  { id: "d2-finals", label: "Finals", short: "FIN", start: "3:00", end: "5:00", location: "HA 492", color: "#f3d1cb", requiredRoles: ["Timekeeper", "Vibe Check", "Media"] },
  { id: "d2-close", label: "Closing + clean-up", short: "END", start: "5:00", end: "6:00", location: "HA 492", color: "#d1e4e7", requiredRoles: ["Hype", "Sweep"] },
];

const day1Plan = [
  ["angela", "d1-checkin", "Participant Care"], ["angela", "d1-kickoff", "Vibe Check"], ["angela", "d1-lunch", "Food Team"], ["angela", "d1-build", "On Call"], ["angela", "d1-close", "Sweep"],
  ["benny", "d1-checkin", "Registration"], ["benny", "d1-build", "Dev Support"], ["benny", "d1-dinner", "Game Mod"], ["benny", "d1-close", "On Call"],
  ["cheryl", "d1-kickoff", "Hype"], ["cheryl", "d1-lunch", "Food Team"], ["cheryl", "d1-build", "On Call"], ["cheryl", "d1-dinner", "Vibe Check"], ["cheryl", "d1-close", "Sweep"],
  ["dane", "d1-checkin", "Participant Care"], ["dane", "d1-kickoff", "Timekeeper"], ["dane", "d1-lunch", "Usher"], ["dane", "d1-build", "On Call"],
  ["eliana", "d1-checkin", "Registration"], ["eliana", "d1-kickoff", "Media"], ["eliana", "d1-build", "Dev Support"],
  ["ethan", "d1-setup", "AV"], ["ethan", "d1-kickoff", "AV"], ["ethan", "d1-build", "On Call"], ["ethan", "d1-dinner", "Game Mod"], ["ethan", "d1-close", "Sweep"],
  ["gautham", "d1-setup", "Materials"], ["gautham", "d1-kickoff", "Hype"], ["gautham", "d1-lunch", "Food Team"], ["gautham", "d1-build", "On Call"], ["gautham", "d1-dinner", "Game Mod"],
  ["grace", "d1-setup", "Room Scout"], ["grace", "d1-checkin", "Participant Care"], ["grace", "d1-lunch", "Food Team"], ["grace", "d1-build", "On Call"], ["grace", "d1-dinner", "Timekeeper"], ["grace", "d1-close", "Sweep"],
  ["isaac", "d1-setup", "Room Scout"], ["isaac", "d1-checkin", "Usher"], ["isaac", "d1-build", "Discord Mod"],
  ["jay", "d1-kickoff", "Hype"], ["jay", "d1-lunch", "Usher"], ["jay", "d1-build", "On Call"],
  ["lillian", "d1-setup", "Materials"], ["lillian", "d1-checkin", "Participant Care"], ["lillian", "d1-lunch", "Usher"], ["lillian", "d1-dinner", "Food Team"], ["lillian", "d1-close", "Sweep"],
  ["pauline", "d1-setup", "AV"], ["pauline", "d1-kickoff", "MC"], ["pauline", "d1-build", "On Call"], ["pauline", "d1-close", "MC"],
] as const;

const day2Plan = [
  ["angela", "d2-checkin", "Participant Care"], ["angela", "d2-hacking", "On Call"], ["angela", "d2-lunch", "Judge Usher"], ["angela", "d2-judging", "Usher Hackers"], ["angela", "d2-finals", "Vibe Check"], ["angela", "d2-close", "Sweep"],
  ["benny", "d2-hacking", "Dev Support"], ["benny", "d2-judging", "Dev Support"], ["benny", "d2-finals", "Vibe Check"], ["benny", "d2-close", "Sweep"],
  ["cheryl", "d2-setup", "Room Scout"], ["cheryl", "d2-checkin", "Participant Care"], ["cheryl", "d2-lunch", "Food Team"], ["cheryl", "d2-judging", "Usher Hackers"], ["cheryl", "d2-finals", "Timekeeper"], ["cheryl", "d2-close", "Hype"],
  ["dane", "d2-checkin", "Food Team"], ["dane", "d2-hacking", "On Call"], ["dane", "d2-lunch", "Judge Usher"], ["dane", "d2-judging", "Timekeeper"], ["dane", "d2-finals", "Vibe Check"],
  ["eliana", "d2-setup", "Materials"], ["eliana", "d2-lunch", "Judge Usher"], ["eliana", "d2-judging", "Timekeeper"], ["eliana", "d2-finals", "Media"], ["eliana", "d2-close", "Sweep"],
  ["ethan", "d2-setup", "Materials"], ["ethan", "d2-checkin", "Participant Care"], ["ethan", "d2-hacking", "On Call"], ["ethan", "d2-judging", "Dev Support"], ["ethan", "d2-finals", "AV"], ["ethan", "d2-close", "Sweep"],
  ["gautham", "d2-setup", "Materials"], ["gautham", "d2-checkin", "Participant Care"], ["gautham", "d2-lunch", "Food Team"], ["gautham", "d2-judging", "Timekeeper"], ["gautham", "d2-finals", "Vibe Check"], ["gautham", "d2-close", "Sweep"],
  ["grace", "d2-setup", "Room Scout"], ["grace", "d2-hacking", "On Call"], ["grace", "d2-lunch", "Food Team"], ["grace", "d2-judging", "Timekeeper"], ["grace", "d2-finals", "Vibe Check"], ["grace", "d2-close", "Sweep"],
  ["isaac", "d2-setup", "Materials"], ["isaac", "d2-checkin", "Participant Care"], ["isaac", "d2-hacking", "Dev Support"], ["isaac", "d2-judging", "Usher Hackers"], ["isaac", "d2-close", "Hype"],
  ["jay", "d2-checkin", "Food Team"], ["jay", "d2-hacking", "On Call"], ["jay", "d2-lunch", "Judge Usher"], ["jay", "d2-judging", "Timekeeper"], ["jay", "d2-finals", "Vibe Check"], ["jay", "d2-close", "Hype"],
  ["lillian", "d2-setup", "Materials"], ["lillian", "d2-checkin", "Food Team"], ["lillian", "d2-lunch", "Judge Usher"], ["lillian", "d2-judging", "Usher Hackers"], ["lillian", "d2-finals", "Vibe Check"], ["lillian", "d2-close", "Sweep"],
  ["pauline", "d2-setup", "AV"], ["pauline", "d2-hacking", "MC"], ["pauline", "d2-judging", "Timekeeper"], ["pauline", "d2-finals", "MC"], ["pauline", "d2-close", "MC"],
] as const;

function makeAssignments(plan: ReadonlyArray<readonly [string, string, string]>, day: "Day 1" | "Day 2"): Assignment[] {
  return plan.map(([personId, blockId, role], index) => ({
    id: `${blockId}-${personId}-${index}`,
    personId,
    blockId,
    blockRoleId: `${blockId}-${roleTemplateId(role)}`,
    role,
    lead: "",
    description: roleDescriptions[role] ?? `Follow the ${day} run-of-show and check in with the event directors before this block begins.`,
    color: roleColor(role),
  }));
}

function defaultAvailability(personId: string) {
  const availability: Record<string, Record<string, AvailabilityStatus>> = { day1: {}, day2: {} };
  for (const block of day1Blocks) availability.day1[block.id] = "available";
  for (const block of day2Blocks) availability.day2[block.id] = "available";
  if (personId === "benny") availability.day1["d1-setup"] = "unavailable";
  if (personId === "dane") availability.day1["d1-close"] = "unavailable";
  if (personId === "eliana") availability.day1["d1-dinner"] = "conditional";
  if (personId === "angela") availability.day2["d2-setup"] = "unavailable";
  if (personId === "grace") availability.day2["d2-close"] = "conditional";
  if (personId === "pauline") availability.day1["d1-dinner"] = "conditional";
  return availability;
}

const seedData: EventState = {
  eventId: "productx-2026",
  eventName: "ProductX 2026",
  eventType: "Competition",
  dateRange: "March 21–22, 2026",
  venue: "Henry Angus Building",
  publishedAt: "Aug 3, 2:14 PM",
  draftChanges: 3,
  prepEnabled: true,
  judgingEnabled: true,
  people: peopleBase.map(([id, name, initials, team, color, preferences]) => ({
    id, name, initials, team, color, preferences: [...preferences],
    phone: id === "pauline" ? "604-555-0182" : id === "benny" ? "604-555-0148" : "",
    email: `${id}@ubcbiztech.com`,
    groupIds: [team.toLowerCase().replace(/[^a-z0-9]+/g, "-")],
    privateNote: id === "angela" ? "Strong participant instincts. Avoid back-to-back physical roles after lunch." : id === "benny" ? "Best first responder for judging platform issues." : "No event-specific notes yet.",
    availability: defaultAvailability(id),
    prepAvailability: Object.fromEntries(prepSessionsSeed.map((session) => [session.id, id === "dane" && session.id === "prep-pack" ? "conditional" : "available"])),
  })),
  days: [
    { id: "day1", label: "Day 1", date: "Saturday, March 21", blocks: day1Blocks, assignments: makeAssignments(day1Plan, "Day 1") },
    { id: "day2", label: "Day 2", date: "Sunday, March 22", blocks: day2Blocks, assignments: makeAssignments(day2Plan, "Day 2") },
  ],
  resources: resourceTemplateItems(),
  prepSessions: prepSessionsSeed,
  prepTasks: [
    { id: "prep-task-1", label: "Print signage and room labels", done: false, ownerPersonId: "angela", sessionId: "prep-pack", notes: "Use the final Figma export." },
    { id: "prep-task-2", label: "Pack registration and AV bins", done: false, ownerPersonId: "ethan", sessionId: "prep-pack", notes: "Test adapters before packing." },
    { id: "prep-task-3", label: "Walk every participant route", done: false, ownerPersonId: "dane", sessionId: "prep-walkthrough", notes: "Confirm accessibility and locked doors." },
  ],
  roleLibrary: Object.entries(roleDescriptions).map(([name, description]) => ({
    id: roleTemplateId(name),
    name,
    description,
  })),
  groups: ["Experience", "Development", "Partnerships", "Marketing", "Finance", "Co-President"].map((name, index) => ({
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name,
    color: ["#dfef79", "#7f99ff", "#b9a7ff", "#f8bb65", "#92c9ff", "#e7f16c"][index],
  })),
  contacts: [
    { id: "c1", name: "Pauline", role: "Event Director", phone: "604-555-0182" },
    { id: "c2", name: "Benny", role: "Technical lead", phone: "604-555-0148" },
    { id: "c3", name: "Campus Security", role: "Emergency", phone: "604-822-2222" },
  ],
  judgingRooms: ["HA 241", "HA 243", "HA 254", "HA 292", "HA 296"].map((room, roomIndex) => ({
    id: `room-${roomIndex + 1}`, room,
    judges: ["Jordyn + Yohen", "Timothy + Sophie", "Riza + Lily", "Camile + Rodolfo", "Yudhvir + Huan"][roomIndex],
    staff: ["Dane · Eliana · Isaac", "Grace · Ethan · Benny", "Gautham · Angela · Ethan", "Lillian · Jay · Isaac", "Cheryl · Dane · Benny"][roomIndex],
    slots: ["1:30", "1:45", "2:00", "2:15", "2:30"].map((time, index) => ({ time, team: `Team ${roomIndex * 5 + index + 1}`, status: index === 0 ? "Presenting" as const : "Waiting" as const })),
  })),
};

function blockRoles(block: EventBlock): BlockRole[] {
  if (block.roles?.length) return block.roles;
  return (block.requiredRoles ?? []).map((name) => ({
    id: `${block.id}-${roleTemplateId(name)}`,
    templateId: roleTemplateId(name),
    name,
    description: roleDescriptions[name] ?? `Support ${block.label} and check in with the block lead before ${block.start}.`,
    leadPersonId: "",
  }));
}

function blockRoleColor(role: BlockRole) {
  return role.color || roleColor(role.name);
}

function keepHighlightedRoleVisible(listbox: HTMLDivElement | null) {
  const option = listbox?.querySelector<HTMLElement>("[data-highlighted='true']");
  if (!listbox || !option) return;
  const listRect = listbox.getBoundingClientRect();
  const optionRect = option.getBoundingClientRect();
  if (optionRect.top < listRect.top) listbox.scrollTop -= listRect.top - optionRect.top;
  else if (optionRect.bottom > listRect.bottom) listbox.scrollTop += optionRect.bottom - listRect.bottom;
}

function timeToMinutes(value: string) {
  const minutes = eventTimeToMinutes(value);
  return Number.isFinite(minutes) ? minutes : Number.MAX_SAFE_INTEGER;
}

function sortBlocks(blocks: EventBlock[]) {
  return [...blocks].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start) || timeToMinutes(a.end) - timeToMinutes(b.end) || a.label.localeCompare(b.label));
}

function assignmentTimeLabel(assignment: Pick<Assignment, "start" | "end">, block: Pick<EventBlock, "start" | "end">) {
  const interval = assignmentInterval(assignment, block);
  return `${formatEventTime(interval.start)}–${formatEventTime(interval.end)}`;
}

function assignmentTimeValue(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function sortPeopleAlphabetically(people: Person[]) {
  return [...people].sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base", numeric: true }) || a.id.localeCompare(b.id));
}

function normalizeEvent(raw: EventState): EventState {
  const eventId = raw.eventId || "productx-2026";
  const legacyGroups = Array.from(new Set((raw.people ?? []).map((person) => person.team).filter(Boolean))).map((name, index) => ({
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name, color: ["#dfef79", "#7f99ff", "#b9a7ff", "#f8bb65", "#92c9ff"][index % 5],
  }));
  const groups = raw.groups?.length ? raw.groups : legacyGroups;
  const derivedRoleNames = Array.from(new Set((raw.days ?? []).flatMap((day) => day.blocks.flatMap((block) => blockRoles(block).map((role) => role.name)))));
  const roleLibrary: RoleTemplate[] = raw.roleLibrary?.length ? raw.roleLibrary.map(({ id, name, description, color, normalizedName, revision }) => ({ id, name, description, color: color || roleColor(name), normalizedName: normalizedName || normalizeRoleName(name), revision: revision || 1 })) : derivedRoleNames.map((name) => ({
    id: roleTemplateId(name),
    name,
    description: roleDescriptions[name] ?? `Support the event team as ${name}.`,
    color: roleColor(name),
    normalizedName: normalizeRoleName(name),
    revision: 1,
  }));
  const prepSessions = raw.prepSessions ?? [];
  const days = raw.days.map((day) => {
    const blocks = sortBlocks(day.blocks.map((block) => ({
      id: block.id,
      label: block.label,
      short: block.short,
      start: block.start,
      end: block.end,
      location: block.location,
      color: block.color,
      requiredRoles: block.requiredRoles ?? [],
      roles: blockRoles(block).map((role) => ({
        id: role.id || `${block.id}-${roleTemplateId(role.name)}`,
        templateId: role.templateId !== undefined ? role.templateId : roleLibrary.find((template) => template.name.toLowerCase() === role.name.toLowerCase())?.id || roleTemplateId(role.name),
        templateRevision: role.templateRevision ?? roleLibrary.find((template) => template.id === role.templateId)?.revision ?? 1,
        customized: role.customized ?? false,
        name: role.name,
        description: role.description,
        leadPersonId: role.leadPersonId ?? "",
        color: role.color,
      })),
      links: block.links ?? [],
    })));
    const assignments = day.assignments.map((assignment) => {
      const block = blocks.find((item) => item.id === assignment.blockId)!;
      const roles = block.roles ?? (block.roles = []);
      let role = roles.find((item) => item.id === assignment.blockRoleId || item.name === assignment.role);
      if (!role) {
        role = {
          id: `${block.id}-${roleTemplateId(assignment.role)}`,
          templateId: roleTemplateId(assignment.role),
          templateRevision: 1,
          customized: false,
          name: assignment.role,
          description: assignment.description,
          leadPersonId: assignment.leadPersonId ?? "",
          color: assignment.color || roleColor(assignment.role),
        };
        roles.push(role);
      }
      return {
        id: assignment.id,
        personId: assignment.personId,
        blockId: assignment.blockId,
        blockRoleId: assignment.blockRoleId || role.id,
        role: assignment.role,
        lead: assignment.lead,
        leadPersonId: assignment.leadPersonId,
        description: assignment.description,
        color: assignment.color || role.color || roleColor(assignment.role),
        customized: assignment.customized ?? false,
        start: assignment.start,
        end: assignment.end,
      };
    });
    return { ...day, blocks, assignments };
  });
  const normalized: EventState = {
    ...raw,
    eventId,
    prepEnabled: raw.prepEnabled ?? Boolean(prepSessions.length || raw.prepTasks?.length),
    judgingEnabled: raw.judgingEnabled ?? (raw.eventType === "Competition" || Boolean(raw.judgingRooms?.length)),
    groups,
    contacts: raw.contacts ?? [],
    resources: (raw.resources ?? []).map((resource) => ({ ...resource, dayOf: resource.dayOf ?? ["Operations", "Program"].includes(resource.group) })),
    prepSessions,
    prepTasks: raw.prepTasks ?? [],
    roleLibrary,
    people: sortPeopleAlphabetically(raw.people.map((person) => ({
      ...person,
      phone: person.phone ?? "",
      email: person.email ?? "",
      groupIds: person.groupIds?.length ? person.groupIds.slice(0, 1) : groups.filter((group) => group.name === person.team).slice(0, 1).map((group) => group.id),
      prepAvailability: Object.fromEntries(prepSessions.map((session) => [session.id, person.prepAvailability?.[session.id] ?? "available"])),
      availability: Object.fromEntries(days.map((day) => [
        day.id,
        Object.fromEntries(day.blocks.map((block) => [block.id, person.availability?.[day.id]?.[block.id] ?? "available"])),
      ])),
      availabilitySlots: Object.fromEntries(days.map((day) => [
        day.id,
        person.availabilitySlots && day.id in person.availabilitySlots
          ? person.availabilitySlots[day.id]
          : slotsFromLegacyAvailability(day, person.availability?.[day.id]),
      ])),
    }))),
    days,
  };
  return mapTimeAvailabilityToBlocks(normalized);
}

function createBlankEvent(values: { name: string; type: string; venue: string; startDate: string; dayCount: number }, people: Person[]): EventState {
  const eventId = `${values.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "event"}-${Date.now()}`;
  const dateForDay = (index: number) => {
    const date = new Date(`${values.startDate}T12:00:00`);
    date.setDate(date.getDate() + index);
    return date.toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  };
  const days = Array.from({ length: values.dayCount }, (_, index): EventDay => ({
    id: `${eventId}-day-${index + 1}`,
    label: `Day ${index + 1}`,
    date: dateForDay(index),
    blocks: [],
    assignments: [],
  }));
  return normalizeEvent({
    eventId,
    eventName: values.name,
    eventType: values.type,
    dateRange: values.dayCount === 1 ? days[0].date : `${days[0].date} – ${days.at(-1)!.date}`,
    venue: values.venue,
    publishedAt: "Not published",
    draftChanges: 1,
    prepEnabled: false,
    judgingEnabled: values.type === "Competition",
    people: people.map((person) => ({
      ...person,
      availability: Object.fromEntries(days.map((day) => [day.id, {}])),
      availabilitySlots: Object.fromEntries(days.map((day) => [day.id, {}])),
      prepAvailability: {},
    })),
    days,
    resources: resourceTemplateItems(),
    prepSessions: [],
    prepTasks: [],
    roleLibrary: [],
    groups: structuredClone((dataSafePeopleGroups(people))),
    contacts: [],
    judgingRooms: [],
  });
}

function dataSafePeopleGroups(people: Person[]): ExecGroup[] {
  const names = Array.from(new Set(people.map((person) => person.team).filter(Boolean)));
  return names.map((name, index) => ({ id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name, color: ["#dfef79", "#7f99ff", "#b9a7ff", "#f8bb65"][index % 4] }));
}

function mergeUniversalRoster(event: EventState, people: Person[], groups: ExecGroup[]): EventState {
  const next = structuredClone(event);
  next.groups = structuredClone(groups);
  const incoming = new Map(people.map((person) => [person.id, person]));
  next.people = event.people.filter((eventPerson) => incoming.has(eventPerson.id)).map((eventPerson) => {
    const rosterPerson = incoming.get(eventPerson.id);
    if (!rosterPerson) return eventPerson;
    return {
      ...eventPerson,
      name: rosterPerson.name,
      initials: rosterPerson.initials,
      team: groups.find((group) => rosterPerson.groupIds[0] === group.id)?.name ?? "Unassigned",
      color: rosterPerson.color,
      phone: rosterPerson.phone,
      email: rosterPerson.email,
      groupIds: rosterPerson.groupIds.slice(0, 1),
    };
  });
  const existingIds = new Set(next.people.map((person) => person.id));
  for (const person of people) {
    if (existingIds.has(person.id)) continue;
    next.people.push({
      ...person,
      team: groups.find((group) => person.groupIds[0] === group.id)?.name ?? "Unassigned",
      groupIds: person.groupIds.slice(0, 1),
      availability: Object.fromEntries(next.days.map((day) => [day.id, Object.fromEntries(day.blocks.map((block) => [block.id, "available"]))])),
      availabilitySlots: Object.fromEntries(next.days.map((day) => [day.id, {}])),
      prepAvailability: Object.fromEntries(next.prepSessions.map((session) => [session.id, "available"])),
    });
  }
  const retainedPersonIds = new Set(people.map((person) => person.id));
  for (const day of next.days) day.assignments = day.assignments.filter((assignment) => retainedPersonIds.has(assignment.personId));
  next.prepTasks = next.prepTasks.map((task) => retainedPersonIds.has(task.ownerPersonId) ? task : { ...task, ownerPersonId: "" });
  next.draftChanges += 1;
  return normalizeEvent(next);
}

function initialsFor(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function parseScheduleText(text: string, dayId: string): EventBlock[] {
  const colors = ["#f3c8cf", "#d8d2ef", "#c5dfd7", "#f7e0a7", "#f3d9bc", "#c8e1ef", "#d1e4e7"];
  const seed = Date.now();
  return parseScheduleTable(text).map((block, index) => ({
    id: `${dayId}-import-${seed}-${index}`,
    label: block.label,
    short: block.label.slice(0, 3).toUpperCase(),
    start: block.start,
    end: block.end,
    location: block.location,
    color: colors[index % colors.length],
    requiredRoles: [],
    roles: [],
    links: [],
  }));
}

function assignmentLeadName(assignment: Assignment, people: Person[]) {
  return people.find((person) => person.id === assignment.leadPersonId)?.name ?? "";
}

function PersonAvatar({ person, small = false }: { person: Person; small?: boolean }) {
  return <span className={`avatar ${small ? "avatar-small" : ""}`} style={{ background: person.color }}>{person.initials}</span>;
}

async function fetchPublishedEvent(eventId?: string) {
  const query = eventId ? `?event=${encodeURIComponent(eventId)}` : "";
  const response = await fetch(`/api/event-state/published${query}`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? "Unable to load the published schedule.");
  return normalizeEvent(payload.state as EventState);
}

export function RelayWorkspace({ initialMode = "director", portalUser }: { initialMode?: "director" | "exec"; portalUser: { name: string; email: string } }) {
  const [data, setData] = useState<EventState>(() => normalizeEvent(seedData));
  const [publishedData, setPublishedData] = useState<EventState | null>(null);
  const [eventLibrary, setEventLibrary] = useState<EventState[]>(() => [normalizeEvent(seedData)]);
  const [hydrated, setHydrated] = useState(false);
  const [mode, setMode] = useState<"director" | "exec">(initialMode);
  const [section, setSection] = useState<Section>("schedule");
  const [dayId, setDayId] = useState("day2");
  const [roleTemplates, setRoleTemplates] = useState<RoleTemplate[]>(builtInRoleTemplates);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState<Record<string, string>>({});
  const [boardLocked, setBoardLocked] = useState(false);
  const [roleEditor, setRoleEditor] = useState<{ blockId: string; blockRoleId: string; assignmentId?: string } | null>(null);
  const [blockEditor, setBlockEditor] = useState<{ blockId?: string } | null>(null);
  const [deleteBlockId, setDeleteBlockId] = useState<string | null>(null);
  const [roleRemoval, setRoleRemoval] = useState<{ dayId: string; blockId: string; blockRoleId: string } | null>(null);
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [showEventLibrary, setShowEventLibrary] = useState(false);
  const [showScheduleImport, setShowScheduleImport] = useState(false);
  const [showRoleImport, setShowRoleImport] = useState(false);
  const [showRoster, setShowRoster] = useState(false);
  const [showScheduleChecks, setShowScheduleChecks] = useState(false);
  const [scheduleReviewTarget, setScheduleReviewTarget] = useState<{ dayId: string; blockId: string; personId: string; nonce: number } | null>(null);
  const [roleTemplateEditor, setRoleTemplateEditor] = useState<{ templateId?: string } | null>(null);
  const [assignmentIntervalEditor, setAssignmentIntervalEditor] = useState<AssignmentIntervalEditor | null>(null);
  const [execPersonId, setExecPersonId] = useState("angela");
  const [toast, setToast] = useState("");
  const [toastError, setToastError] = useState(false);
  const [undoState, setUndoState] = useState<EventState | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [loadingPublished, setLoadingPublished] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null);
  const [shareLink, setShareLink] = useState<ShareLink | null>(null);
  const confirmationResolver = useRef<((confirmed: boolean) => void) | null>(null);

  const requestConfirmation = (request: ConfirmationRequest) => new Promise<boolean>((resolve) => {
    confirmationResolver.current?.(false);
    confirmationResolver.current = resolve;
    setConfirmation(request);
  });

  const resolveConfirmation = (confirmed: boolean) => {
    confirmationResolver.current?.(confirmed);
    confirmationResolver.current = null;
    setConfirmation(null);
  };

  const showError = (message: string) => {
    setToastError(true);
    setToast(message);
    window.setTimeout(() => { setToast(""); setToastError(false); }, 4800);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialPersonId = params.get("person");
    const requestedEventId = params.get("event") ?? undefined;
    const restoreExecView = params.get("view") === "exec" || window.localStorage.getItem(WORKSPACE_MODE_KEY) === "exec";

    if (restoreExecView) {
      void fetchPublishedEvent(requestedEventId)
        .then((published) => {
          setPublishedData(published);
          const rememberedDayId = window.localStorage.getItem(execDayStorageKey(published.eventId));
          setDayId(published.days.some((day) => day.id === rememberedDayId) ? rememberedDayId! : (published.days[0]?.id ?? "day1"));
          const rememberedPersonId = initialPersonId ?? window.localStorage.getItem(`relay:v1:exec-person:${published.eventId}`);
          if (rememberedPersonId && published.people.some((person: Person) => person.id === rememberedPersonId)) {
            setExecPersonId(rememberedPersonId);
          }
          setMode("exec");
          window.localStorage.setItem(WORKSPACE_MODE_KEY, "exec");
          setExecViewUrl(true, published.eventId);
        })
        .catch((error) => {
          window.localStorage.removeItem(WORKSPACE_MODE_KEY);
          setExecViewUrl(false);
          setMode("director");
          showError(error instanceof Error ? error.message : "Unable to restore Exec View.");
        });
    }

    Promise.all([
      fetch("/api/event-state").then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? `Unable to load shared event data (HTTP ${response.status}).`);
        return payload;
      }),
      fetch("/api/role-library").then((response) => response.ok ? response.json() : { roles: [] }),
    ])
      .then(([payload, rolePayload]) => {
        const states = (payload.states ?? (payload.state ? [payload.state] : [])).map((state: EventState) => normalizeEvent(state));
        const remoteRoles = (rolePayload.roles ?? []) as RoleTemplate[];
        if (states.length) {
          const initial = states.find((state: EventState) => state.eventId === requestedEventId) ?? states[0];
          const mergedRoles = new Map<string, RoleTemplate>();
          const librarySources = remoteRoles.length ? [...builtInRoleTemplates, ...remoteRoles] : [...builtInRoleTemplates, ...initial.roleLibrary];
          for (const role of librarySources) {
            const normalizedName = role.normalizedName || normalizeRoleName(role.name);
            mergedRoles.set(normalizedName, { ...role, normalizedName, revision: role.revision || 1 });
          }
          setRoleTemplates(Array.from(mergedRoles.values()).sort((a, b) => a.name.localeCompare(b.name)));
          setEventLibrary(states);
          setData(initial);
          if (!restoreExecView) {
            setDayId(initial.days[0].id);
            const rememberedPersonId = initialPersonId ?? window.localStorage.getItem(`relay:v1:exec-person:${initial.eventId}`);
            if (rememberedPersonId && initial.people.some((person: Person) => person.id === rememberedPersonId)) setExecPersonId(rememberedPersonId);
          }
          setBoardLocked(window.localStorage.getItem(`relay:v1:board-locked:${initial.eventId}`) === "true");
          setSelectedRoles({});
        }
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "Unable to load shared event data.";
        setLoadError(message);
        showError(message);
      })
      .finally(() => setHydrated(true));
  }, []);
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setBoardLocked(window.localStorage.getItem(`relay:v1:board-locked:${data.eventId}`) === "true");
      setSelectedRoles({});
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [data.eventId]);

  useEffect(() => {
    const clearSelections = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedRoles({});
    };
    window.addEventListener("keydown", clearSelections);
    return () => window.removeEventListener("keydown", clearSelections);
  }, []);

  const save = async (next: EventState, message: string, undo?: EventState) => {
    const mapped = mapTimeAvailabilityToBlocks(structuredClone(next));
    setData(mapped);
    setEventLibrary((current) => current.some((event) => event.eventId === mapped.eventId) ? current.map((event) => event.eventId === mapped.eventId ? mapped : event) : [mapped, ...current]);
    setSaving(true);
    setToast(message);
    setUndoState(undo ?? null);
    try {
      const response = await fetch("/api/event-state", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(mapped) });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      }
      const payload = await response.json();
      if (payload.state) {
        const persisted = normalizeEvent(payload.state);
        setData(persisted);
        setEventLibrary((current) => current.map((event) => event.eventId === persisted.eventId ? persisted : event));
      }
    } catch (error) {
      setUndoState(null);
      showError(`Save failed: ${error instanceof Error ? error.message : "Unable to save this change."}`);
    } finally {
      setSaving(false);
      window.setTimeout(() => { setToast((current) => current === message ? "" : current); setUndoState(null); }, 3200);
    }
  };

  const activeDay = data.days.find((day) => day.id === dayId) ?? data.days[0];
  const publication = getPublicationStatus(data.publishedAt);
  const warnings = useMemo(() => getAssignmentAvailabilityChecks(data.days, data.people), [data]);

  const publish = async () => {
    setPublishing(true);
    setSaving(true);
    setToast("");
    try {
      const published = normalizeEvent(await publishEventState(mapTimeAvailabilityToBlocks(structuredClone(data))));
      setData(published);
      setPublishedData(published);
      setEventLibrary((current) => current.some((event) => event.eventId === published.eventId) ? current.map((event) => event.eventId === published.eventId ? published : event) : [published, ...current]);
      setToastError(false);
      setToast("Published. Everyone’s view is up to date.");
      window.setTimeout(() => setToast(""), 2400);
    } catch (error) {
      setToastError(true);
      setToast(`Publish failed: ${error instanceof Error ? error.message : "Unable to publish the event."}`);
      window.setTimeout(() => setToast(""), 4800);
    } finally {
      setPublishing(false);
      setSaving(false);
    }
  };

  const toggleBoardLock = () => {
    const nextLocked = !boardLocked;
    setBoardLocked(nextLocked);
    window.localStorage.setItem(`relay:v1:board-locked:${data.eventId}`, String(nextLocked));
    if (nextLocked) setSelectedRoles({});
  };

  const toggleSelectedRole = (blockId: string, blockRoleId: string) => {
    if (boardLocked) return;
    setSelectedRoles((current) => ({ ...current, [blockId]: current[blockId] === blockRoleId ? "" : blockRoleId }));
  };

  const commitBlockRoleAssignment = (
    blockId: string,
    personId: string,
    blockRoleId: string,
    requested?: { start: string; end: string },
  ) => {
    if (boardLocked) return;
    const existing = activeDay.assignments.find((assignment) => assignment.blockId === blockId && assignment.personId === personId);
    const person = data.people.find((item) => item.id === personId)!;
    const block = activeDay.blocks.find((item) => item.id === blockId)!;
    const existingInterval = existing ? assignmentInterval(existing, block) : null;
    const interval = requested ?? (existingInterval ? { start: assignmentTimeValue(existingInterval.start), end: assignmentTimeValue(existingInterval.end) } : { start: block.start, end: block.end });
    const conflict = findAssignmentConflict(activeDay, personId, blockId, existing?.id, interval);
    if (conflict) {
      setToastError(true);
      const conflictTime = assignmentTimeLabel(conflict.assignment, conflict.block);
      setToast(`${person.name} is already assigned to ${conflict.block.label} (${conflictTime}).`);
      window.setTimeout(() => { setToast(""); setToastError(false); }, 3200);
      return;
    }
    const previous = structuredClone(data);
    const next = structuredClone(data);
    const day = next.days.find((item) => item.id === dayId)!;
    const nextBlock = day.blocks.find((item) => item.id === blockId)!;
    const role = blockRoles(nextBlock).find((item) => item.id === blockRoleId)!;
    const assignment = day.assignments.find((item) => item.blockId === blockId && item.personId === personId);
    const selectedInterval = assignmentInterval(interval, nextBlock);
    const blockInterval = assignmentInterval(undefined, nextBlock);
    const intervalFields = selectedInterval.start === blockInterval.start && selectedInterval.end === blockInterval.end
      ? { start: undefined, end: undefined }
      : { start: assignmentTimeValue(selectedInterval.start), end: assignmentTimeValue(selectedInterval.end) };
    let message = "";
    if (assignment) {
      const previousRole = assignment.role;
      Object.assign(assignment, {
        blockRoleId: role.id,
        role: role.name,
        lead: data.people.find((item) => item.id === role.leadPersonId)?.name ?? "",
        leadPersonId: role.leadPersonId,
        description: role.description,
        color: blockRoleColor(role),
        customized: false,
        ...intervalFields,
      });
      message = previousRole === role.name
        ? `${person.name}'s ${role.name} time updated to ${assignmentTimeLabel(assignment, nextBlock)}.`
        : `${person.name} moved from ${previousRole} to ${role.name}.`;
    } else {
      day.assignments.push({
        id: `${blockId}-${personId}-${Date.now()}`,
        personId,
        blockId,
        blockRoleId: role.id,
        role: role.name,
        lead: data.people.find((item) => item.id === role.leadPersonId)?.name ?? "",
        leadPersonId: role.leadPersonId,
        description: role.description,
        color: blockRoleColor(role),
        customized: false,
        ...intervalFields,
      });
      const created = day.assignments.at(-1)!;
      message = `${person.name} assigned to ${role.name} · ${assignmentTimeLabel(created, nextBlock)}.`;
    }
    next.draftChanges += 1;
    void save(next, message, previous);
  };

  const assignBlockRoleToPerson = async (blockId: string, personId: string, blockRoleId: string) => {
    if (boardLocked) return;
    const existing = activeDay.assignments.find((assignment) => assignment.blockId === blockId && assignment.personId === personId);
    if (existing?.blockRoleId === blockRoleId) {
      clearAssignment(existing.id);
      return;
    }
    const person = data.people.find((item) => item.id === personId)!;
    const block = activeDay.blocks.find((item) => item.id === blockId)!;
    const requested = existing ? { start: existing.start ?? block.start, end: existing.end ?? block.end } : undefined;
    const fullStatus = assignmentAvailabilityFromSlots(block, activeDay, person.availabilitySlots?.[activeDay.id] ?? {}, requested);
    const availableIntervals = getAvailableAssignmentIntervals(block, activeDay, person.availabilitySlots?.[activeDay.id] ?? {});
    if (!existing && fullStatus === "conditional" && availableIntervals.length) {
      setAssignmentIntervalEditor({ blockId, personId, blockRoleId });
      return;
    }
    if (fullStatus !== "available" && !await requestConfirmation({ title: `Assign ${person.name} anyway?`, message: `${person.name} is not fully available for this interval.`, confirmLabel: "Assign anyway", tone: "warning" })) return;
    commitBlockRoleAssignment(blockId, personId, blockRoleId, requested);
  };

  const changeAssignment = (blockId: string, personId: string) => {
    if (boardLocked) return;
    const blockRoleId = selectedRoles[blockId];
    if (!blockRoleId) return;
    assignBlockRoleToPerson(blockId, personId, blockRoleId);
  };

  const clearAssignment = (assignmentId: string) => {
    if (boardLocked) return;
    const assignment = activeDay.assignments.find((item) => item.id === assignmentId);
    const person = data.people.find((item) => item.id === assignment?.personId);
    if (!assignment || !person) return;
    const previous = structuredClone(data);
    const next = structuredClone(data);
    const day = next.days.find((item) => item.id === dayId)!;
    day.assignments = day.assignments.filter((item) => item.id !== assignmentId);
    next.draftChanges += 1;
    void save(next, `${person.name} cleared from ${assignment.role}.`, previous);
  };

  const assignRestToOnCall = (blockId: string, blockRoleId: string) => {
    if (boardLocked) return;
    const previous = structuredClone(data);
    const next = structuredClone(data);
    const day = next.days.find((item) => item.id === dayId)!;
    const block = day.blocks.find((item) => item.id === blockId)!;
    const role = blockRoles(block).find((item) => item.id === blockRoleId)!;
    const unassigned = next.people.filter((person) => (person.availability[day.id]?.[blockId] ?? "available") === "available" && !day.assignments.some((assignment) => assignment.blockId === blockId && assignment.personId === person.id));
    for (const person of unassigned) {
      day.assignments.push({ id: `${blockId}-${person.id}-${Date.now()}-${person.id}`, personId: person.id, blockId, blockRoleId, role: role.name, lead: data.people.find((item) => item.id === role.leadPersonId)?.name ?? "", leadPersonId: role.leadPersonId, description: role.description, color: blockRoleColor(role), customized: false });
    }
    if (!unassigned.length) { setToast("Everyone available is already assigned."); return; }
    next.draftChanges += 1;
    void save(next, `${unassigned.length} available people assigned to On Call.`, previous);
  };

  const addScheduleRoleToBlock = async (blockId: string, template: RoleTemplate, personId?: string, linkedToLibrary = true) => {
    let needsIntervalChoice = false;
    if (personId) {
      const person = data.people.find((item) => item.id === personId)!;
      const targetBlock = activeDay.blocks.find((item) => item.id === blockId)!;
      const status = assignmentAvailabilityFromSlots(targetBlock, activeDay, person.availabilitySlots?.[activeDay.id] ?? {});
      needsIntervalChoice = status === "conditional" && getAvailableAssignmentIntervals(targetBlock, activeDay, person.availabilitySlots?.[activeDay.id] ?? {}).length > 0;
      const conflict = needsIntervalChoice ? undefined : findAssignmentConflict(activeDay, personId, blockId);
      if (conflict) {
        setToastError(true);
        setToast(`${person.name} is already assigned to ${conflict.block.label} (${conflict.block.start}–${conflict.block.end}).`);
        window.setTimeout(() => { setToast(""); setToastError(false); }, 3200);
        return;
      }
      if (status === "unavailable" && !await requestConfirmation({ title: `Assign ${person.name} anyway?`, message: `${person.name} is marked unavailable for this block.`, confirmLabel: "Assign anyway", tone: "warning" })) return;
    }
    const previous = structuredClone(data);
    const next = structuredClone(data);
    const day = next.days.find((item) => item.id === dayId)!;
    const block = day.blocks.find((item) => item.id === blockId)!;
    const existing = blockRoles(block).find((role) => (linkedToLibrary && role.templateId === template.id) || normalizeRoleName(role.name) === normalizeRoleName(template.name));
    if (existing) {
      if (personId) assignBlockRoleToPerson(blockId, personId, existing.id);
      else setSelectedRoles((current) => ({ ...current, [blockId]: existing.id }));
      return;
    }
    const role: BlockRole = { id: `${blockId}-${template.id || roleTemplateId(template.name)}-${Date.now()}`, templateId: linkedToLibrary ? template.id : "", templateRevision: linkedToLibrary ? template.revision || 1 : undefined, customized: false, name: template.name, description: template.description || `Support ${block.label}.`, leadPersonId: "", color: template.color || roleColor(template.name) };
    block.roles = [...blockRoles(block), role];
    block.requiredRoles = block.roles.map((item) => item.name);
    if (personId) {
      const person = next.people.find((item) => item.id === personId)!;
      if (needsIntervalChoice) {
        next.draftChanges += 1;
        void save(next, `${template.name} added to ${block.label}. Choose ${person.name}'s assignment time.`, previous);
        setAssignmentIntervalEditor({ blockId, personId, blockRoleId: role.id });
        return;
      }
      day.assignments.push({ id: `${blockId}-${personId}-${Date.now()}`, personId, blockId, blockRoleId: role.id, role: role.name, lead: "", leadPersonId: "", description: role.description, color: blockRoleColor(role), customized: false });
      next.draftChanges += 1;
      void save(next, `${template.name} added to ${block.label} and assigned to ${person.name}.`, previous);
      return;
    }
    next.draftChanges += 1;
    setSelectedRoles((current) => ({ ...current, [blockId]: role.id }));
    void save(next, `${template.name} added to ${block.label}.`, previous);
  };

  const createAndAddRole = async (blockId: string, name: string, color: string, saveToLibrary: boolean, personId?: string) => {
    const template: RoleTemplate = { id: `${roleTemplateId(name)}-${Date.now()}`, name: name.trim(), description: "", color, normalizedName: normalizeRoleName(name), revision: 1 };
    if (!saveToLibrary) {
      await addScheduleRoleToBlock(blockId, template, personId, false);
      return;
    }
    try {
      const response = await fetch("/api/role-library", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(template) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
      const saved = payload.role as RoleTemplate;
      setRoleTemplates((current) => [...current.filter((role) => role.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)));
      await addScheduleRoleToBlock(blockId, saved, personId, true);
    } catch (error) {
      showError(`Role could not be created: ${error instanceof Error ? error.message : "Unable to update the role library."}`);
    }
  };

  const moveAssignment = async (assignmentId: string, targetBlockId: string, targetPersonId: string) => {
    if (boardLocked) return;
    const source = activeDay.assignments.find((item) => item.id === assignmentId);
    const targetPerson = data.people.find((item) => item.id === targetPersonId);
    if (!source || !targetPerson || (source.blockId === targetBlockId && source.personId === targetPersonId)) return;
    const targetExisting = activeDay.assignments.find((item) => item.blockId === targetBlockId && item.personId === targetPersonId);
    const conflict = findAssignmentConflict({ ...activeDay, assignments: activeDay.assignments.filter((item) => item.id !== source.id) }, targetPersonId, targetBlockId, targetExisting?.id);
    if (conflict) {
      setToastError(true);
      setToast(`${targetPerson.name} is already assigned to ${conflict.block.label} (${conflict.block.start}–${conflict.block.end}).`);
      window.setTimeout(() => { setToast(""); setToastError(false); }, 3200);
      return;
    }
    const status = targetPerson.availability[activeDay.id]?.[targetBlockId] ?? "available";
    if (status === "unavailable" && !await requestConfirmation({ title: `Move ${targetPerson.name} anyway?`, message: `${targetPerson.name} is marked unavailable for this block.`, confirmLabel: "Move anyway", tone: "warning" })) return;
    const previous = structuredClone(data);
    const next = structuredClone(data);
    const day = next.days.find((item) => item.id === dayId)!;
    const sourceBlock = day.blocks.find((item) => item.id === source.blockId)!;
    const targetBlock = day.blocks.find((item) => item.id === targetBlockId)!;
    const sourceRole = blockRoles(sourceBlock).find((item) => item.id === source.blockRoleId);
    if (!sourceRole) return;
    let targetRole = blockRoles(targetBlock).find((item) => item.templateId === sourceRole.templateId || item.name.toLowerCase() === sourceRole.name.toLowerCase());
    if (!targetRole) {
      targetRole = { ...sourceRole, id: `${targetBlockId}-${sourceRole.templateId}-${Date.now()}` };
      targetBlock.roles = [...blockRoles(targetBlock), targetRole];
      targetBlock.requiredRoles = targetBlock.roles.map((item) => item.name);
    }
    day.assignments = day.assignments.filter((item) => item.id !== source.id && item.id !== targetExisting?.id);
    day.assignments.push({ ...source, id: `${targetBlockId}-${targetPersonId}-${Date.now()}`, personId: targetPersonId, blockId: targetBlockId, blockRoleId: targetRole.id, role: targetRole.name, description: targetRole.description, leadPersonId: targetRole.leadPersonId, lead: next.people.find((item) => item.id === targetRole.leadPersonId)?.name ?? "", color: blockRoleColor(targetRole), customized: false, start: undefined, end: undefined });
    next.draftChanges += 1;
    void save(next, `${source.role} moved to ${targetPerson.name}${targetExisting ? `, replacing ${targetExisting.role}` : ""}.`, previous);
  };

  const saveRoleEdit = (values: { name: string; description: string; leadPersonId: string; color: string; scope: "individual" | "block" | "event"; resetToLibrary?: boolean }) => {
    if (!roleEditor) return;
    const currentBlock = activeDay.blocks.find((block) => block.id === roleEditor.blockId)!;
    const currentRole = blockRoles(currentBlock).find((role) => role.id === roleEditor.blockRoleId)!;
    const previous = structuredClone(data);
    const next = structuredClone(data);
    if (values.scope === "individual" && roleEditor.assignmentId) {
      const assignment = next.days.flatMap((day) => day.assignments).find((item) => item.id === roleEditor.assignmentId)!;
      Object.assign(assignment, { role: values.name, description: values.description, leadPersonId: values.leadPersonId, lead: next.people.find((person) => person.id === values.leadPersonId)?.name ?? "", color: values.color, customized: true });
    } else {
      for (const day of next.days) {
        for (const block of day.blocks) {
          const role = blockRoles(block).find((item) => item.id === currentRole.id || (values.scope === "event" && Boolean(currentRole.templateId) && item.templateId === currentRole.templateId));
          if (!role) continue;
          const sourceTemplate = roleTemplates.find((template) => template.id === role.templateId);
          const customized = !values.resetToLibrary && isRoleSnapshotCustomized({ name: values.name, description: values.description, color: values.color }, sourceTemplate && { ...sourceTemplate, color: sourceTemplate.color || roleColor(sourceTemplate.name) });
          Object.assign(role, { name: values.name, description: values.description, leadPersonId: values.leadPersonId, color: values.color, customized, templateRevision: values.resetToLibrary ? sourceTemplate?.revision || role.templateRevision : role.templateRevision });
          block.requiredRoles = blockRoles(block).map((item) => item.name);
          for (const assignment of day.assignments.filter((item) => item.blockRoleId === role.id)) {
            Object.assign(assignment, { role: values.name, description: values.description, leadPersonId: values.leadPersonId, lead: next.people.find((person) => person.id === values.leadPersonId)?.name ?? "", color: values.color, customized: false });
          }
        }
      }
    }
    next.draftChanges += 1;
    setRoleEditor(null);
    void save(next, values.scope === "individual" ? "Assignment details updated." : values.scope === "event" ? "Role updated across this event." : "Role updated for this block.", previous);
  };

  const reviewScheduleCheck = (check: ScheduleCheck) => {
    if (!check.dayId || !check.blockId || !check.personId) return;
    setMode("director");
    setSection("schedule");
    setDayId(check.dayId);
    setShowScheduleChecks(false);
    setScheduleReviewTarget(null);
    window.setTimeout(() => setScheduleReviewTarget({ dayId: check.dayId!, blockId: check.blockId!, personId: check.personId!, nonce: Date.now() }), 0);
  };

  const requestBlockRoleRemoval = (blockId: string, blockRoleId: string) => {
    setRoleRemoval({ dayId, blockId, blockRoleId });
  };

  const removeBlockRole = () => {
    if (!roleRemoval) return;
    const previous = structuredClone(data);
    const next = structuredClone(data);
    const day = next.days.find((item) => item.id === roleRemoval.dayId);
    const block = day?.blocks.find((item) => item.id === roleRemoval.blockId);
    const role = block && blockRoles(block).find((item) => item.id === roleRemoval.blockRoleId);
    if (!day || !block || !role) {
      setRoleRemoval(null);
      return;
    }
    block.roles = blockRoles(block).filter((item) => item.id !== roleRemoval.blockRoleId);
    block.requiredRoles = block.roles.map((item) => item.name);
    day.assignments = day.assignments.filter((item) => item.blockId !== roleRemoval.blockId || item.blockRoleId !== roleRemoval.blockRoleId);
    next.draftChanges += 1;
    setRoleRemoval(null);
    setRoleEditor(null);
    setSelectedRoles((current) => ({ ...current, [block.id]: "" }));
    void save(next, `${role.name} removed from ${block.label}.`, previous);
  };

  const removeRoleFromBlock = () => {
    if (!roleEditor || roleEditor.assignmentId) return;
    requestBlockRoleRemoval(roleEditor.blockId, roleEditor.blockRoleId);
  };

  const changeExecPerson = (personId: string) => {
    setExecPersonId(personId);
    window.localStorage.setItem(`relay:v1:exec-person:${(publishedData ?? data).eventId}`, personId);
  };

  const cycleBlockAvailability = (personId: string, blockId: string) => {
    const previous = structuredClone(data);
    const next = structuredClone(data);
    const day = next.days.find((item) => item.id === dayId)!;
    const block = day.blocks.find((item) => item.id === blockId)!;
    const person = next.people.find((item) => item.id === personId)!;
    const blockStart = eventTimeToMinutes(block.start);
    const blockEnd = eventTimeToMinutes(block.end);
    const relevantSlots = getAvailabilitySlots(day).filter((slot) => slot.start < blockEnd && slot.end > blockStart);
    const current = person.availability[day.id]?.[block.id] ?? "unavailable";
    const requested: AvailabilityStatus = current === "unavailable" ? "available" : current === "available" ? "conditional" : "unavailable";
    const status: AvailabilityStatus = requested === "conditional" && relevantSlots.length < 2 ? "unavailable" : requested;
    person.availabilitySlots ??= {};
    person.availabilitySlots[day.id] ??= {};
    relevantSlots.forEach((slot, index) => {
      person.availabilitySlots![day.id][slot.key] = status === "available" || (status === "conditional" && index < Math.ceil(relevantSlots.length / 2));
    });
    next.draftChanges += 1;
    void save(next, `${person.name} marked ${status} for ${block.label}.`, previous);
  };

  async function openExecView(eventId = data.eventId) {
    setLoadingPublished(true);
    setLoadError("");
    try {
      const published = await fetchPublishedEvent(eventId);
      setPublishedData(published);
      const remembered = window.localStorage.getItem(`relay:v1:exec-person:${published.eventId}`);
      if (remembered && published.people.some((person) => person.id === remembered)) setExecPersonId(remembered);
      else if (!published.people.some((person) => person.id === execPersonId)) setExecPersonId(published.people[0]?.id ?? "");
      const rememberedDayId = window.localStorage.getItem(execDayStorageKey(published.eventId));
      setDayId(published.days.some((day) => day.id === rememberedDayId) ? rememberedDayId! : (published.days[0]?.id ?? dayId));
      setMode("exec");
      window.localStorage.setItem(WORKSPACE_MODE_KEY, "exec");
      setExecViewUrl(true, published.eventId);
    } catch (error) {
      setMode("director");
      window.localStorage.removeItem(WORKSPACE_MODE_KEY);
      setExecViewUrl(false);
      showError(error instanceof Error ? error.message : "Unable to load the published schedule.");
    } finally {
      setLoadingPublished(false);
    }
  }

  const exitExecView = () => {
    window.localStorage.removeItem(WORKSPACE_MODE_KEY);
    setExecViewUrl(false);
    setMode("director");
  };

  const saveBlock = (block: EventBlock) => {
    const next = structuredClone(data);
    const day = next.days.find((item) => item.id === dayId)!;
    const existingIndex = day.blocks.findIndex((item) => item.id === block.id);
    if (existingIndex >= 0) day.blocks[existingIndex] = block;
    else day.blocks.push(block);
    day.blocks = sortBlocks(day.blocks);
    next.draftChanges += 1;
    setBlockEditor(null);
    void save(next, existingIndex >= 0 ? "Block updated everywhere." : "Block added to the schedule.");
  };

  const duplicateBlock = (blockId: string) => {
    const next = structuredClone(data);
    const day = next.days.find((item) => item.id === dayId)!;
    const sourceIndex = day.blocks.findIndex((item) => item.id === blockId);
    if (sourceIndex < 0) return;
    const source = day.blocks[sourceIndex];
    const duplicateId = `${day.id}-block-${Date.now()}`;
    const duplicate = structuredClone(source);
    duplicate.id = duplicateId;
    duplicate.label = `${source.label} copy`;
    duplicate.roles = blockRoles(source).map((role, index) => ({ ...role, id: `${duplicateId}-role-${index}` }));
    duplicate.links = (source.links ?? []).map((link, index) => ({ ...link, id: `${duplicateId}-link-${index}` }));
    day.blocks.splice(sourceIndex + 1, 0, duplicate);
    next.draftChanges += 1;
    void save(next, `${source.label} duplicated with its roles and instructions.`);
  };

  const deleteBlock = (blockId: string) => {
    const block = activeDay.blocks.find((item) => item.id === blockId);
    if (!block) return;
    const previous = structuredClone(data);
    const next = structuredClone(data);
    const day = next.days.find((item) => item.id === dayId)!;
    day.blocks = day.blocks.filter((item) => item.id !== blockId);
    day.assignments = day.assignments.filter((assignment) => assignment.blockId !== blockId);
    next.draftChanges += 1;
    setDeleteBlockId(null);
    void save(next, `${block.label} deleted from the schedule.`, previous);
  };

  const importSchedule = (blocks: EventBlock[], replace: boolean) => {
    const next = structuredClone(data);
    const day = next.days.find((item) => item.id === dayId)!;
    if (replace) {
      day.blocks = sortBlocks(blocks);
      day.assignments = [];
    } else {
      day.blocks = sortBlocks([...day.blocks, ...blocks]);
    }
    next.draftChanges += 1;
    setShowScheduleImport(false);
    void save(next, `${blocks.length} schedule block${blocks.length === 1 ? "" : "s"} imported.`);
  };

  const saveRoster = async (people: Person[], groups: ExecGroup[]) => {
    const sourceEvents = eventLibrary.some((event) => event.eventId === data.eventId) ? eventLibrary : [data, ...eventLibrary];
    const updatedEvents = sourceEvents.map((event) => mergeUniversalRoster(event, people, groups));
    const next = updatedEvents.find((event) => event.eventId === data.eventId)!;
    setData(next);
    setEventLibrary(updatedEvents);
    setShowRoster(false);
    setSaving(true);
    setToast("Universal exec roster updated across events.");
    try {
      const persisted = await Promise.all(updatedEvents.map(async (event) => {
        const response = await fetch("/api/event-state", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(event) });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
        return normalizeEvent(payload.state ?? event);
      }));
      setEventLibrary(persisted);
      setData(persisted.find((event) => event.eventId === data.eventId) ?? next);
    } catch (error) {
      showError(`Roster save failed: ${error instanceof Error ? error.message : "Unable to update every event."}`);
    } finally {
      setSaving(false);
      window.setTimeout(() => setToast(""), 3200);
    }
  };

  const persistRoleTemplate = async (template: RoleTemplate, replaceExisting = false) => {
    const response = await fetch("/api/role-library", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...template, replaceExisting }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error ?? `HTTP ${response.status}`) as Error & { existing?: RoleTemplate };
      error.existing = payload.existing;
      throw error;
    }
    return payload.role as RoleTemplate;
  };

  const saveRoleTemplate = async (template: RoleTemplate) => {
    try {
      const duplicate = roleTemplates.find((item) => item.id !== template.id && (item.normalizedName || normalizeRoleName(item.name)) === normalizeRoleName(template.name));
      if (duplicate) throw new Error(`A master role named ${duplicate.name} already exists. Edit or merge that role instead.`);
      const saved = await persistRoleTemplate(template);
      const existed = roleTemplates.some((item) => item.id === saved.id);
      setRoleTemplates((current) => [...current.filter((item) => item.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)));
      setRoleTemplateEditor(null);
      setToast(existed ? `${saved.name} updated in the master library.` : `${saved.name} added to the master library.`);
      window.setTimeout(() => setToast(""), 2600);
    } catch (error) {
      showError(`Role library update failed: ${error instanceof Error ? error.message : "Unable to save this role."}`);
    }
  };

  const deleteRoleTemplate = async (templateId: string) => {
    const template = roleTemplates.find((item) => item.id === templateId);
    if (!template || !await requestConfirmation({ title: `Delete “${template.name}”?`, message: "Roles already placed in blocks will stay as editable custom roles.", confirmLabel: "Delete role", tone: "danger" })) return;
    const next = structuredClone(data);
    for (const day of next.days) for (const block of day.blocks) for (const role of blockRoles(block)) if (role.templateId === templateId) Object.assign(role, { templateId: "", templateRevision: undefined, customized: false });
    setRoleTemplates((current) => current.filter((item) => item.id !== templateId));
    next.draftChanges += 1;
    setRoleTemplateEditor(null);
    void fetch(`/api/role-library?id=${encodeURIComponent(templateId)}`, { method: "DELETE" }).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    }).catch((error) => showError(`Role library update failed: ${error instanceof Error ? error.message : "Unable to delete this role."}`));
    void save(next, `${template.name} removed from the role library.`);
  };

  const addLibraryRoleToBlock = (templateId: string, blockId: string) => {
    const next = structuredClone(data);
    const template = roleTemplates.find((item) => item.id === templateId);
    const day = next.days.find((item) => item.id === dayId);
    const block = day?.blocks.find((item) => item.id === blockId);
    if (!template || !block) return;
    const roles = blockRoles(block);
    if (roles.some((role) => role.templateId === templateId || role.name.toLowerCase() === template.name.toLowerCase())) {
      setToast(`${template.name} is already in ${block.label}.`);
      window.setTimeout(() => setToast(""), 2400);
      return;
    }
    block.roles = [...roles, { id: `${block.id}-role-${Date.now()}`, templateId, templateRevision: template.revision || 1, customized: false, name: template.name, description: template.description, color: template.color, leadPersonId: "" }];
    block.requiredRoles = block.roles.map((role) => role.name);
    next.draftChanges += 1;
    void save(next, `${template.name} added to ${block.label}. Edit the block to tailor its instructions.`);
  };

  const importRoleTemplates = async (rows: RoleImportRow[]) => {
    const validRows = rows.filter((row) => !row.error);
    let current = [...roleTemplates];
    let created = 0;
    let updated = 0;
    let failed = 0;
    for (const row of validRows) {
      const existing = current.find((role) => (role.normalizedName || normalizeRoleName(role.name)) === normalizeRoleName(row.name));
      const template: RoleTemplate = { id: existing?.id ?? `${roleTemplateId(row.name)}-${Date.now()}-${row.row}`, name: row.name, description: row.description, color: row.color || existing?.color || nextRoleColor(current.map((role) => role.color)), normalizedName: normalizeRoleName(row.name), revision: existing?.revision || 1 };
      try {
        const saved = await persistRoleTemplate(template);
        current = [...current.filter((role) => role.id !== saved.id), saved];
        if (existing) updated += 1;
        else created += 1;
      } catch {
        failed += 1;
      }
    }
    setRoleTemplates(current.sort((a, b) => a.name.localeCompare(b.name)));
    setShowRoleImport(false);
    setToast(`${created} created · ${updated} updated${failed ? ` · ${failed} failed` : ""}`);
    setToastError(Boolean(failed));
    window.setTimeout(() => { setToast(""); setToastError(false); }, 3600);
  };

  const mergeRoleTemplates = async (sourceId: string, targetId: string) => {
    const source = roleTemplates.find((role) => role.id === sourceId);
    const target = roleTemplates.find((role) => role.id === targetId);
    if (!source || !target) return;
    const confirmed = await requestConfirmation({
      title: `Merge “${source.name}” into “${target.name}”?`,
      message: `“${target.name}” will remain in the master library. Event roles linked to “${source.name}” will point to it, while their event-specific instructions, leads, and assignments stay unchanged.`,
      confirmLabel: "Merge roles",
      cancelLabel: "Keep both",
      tone: "danger",
    });
    if (!confirmed) return;
    try {
      const response = await fetch("/api/role-library", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "merge", sourceId, targetId }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
      const relinkEvent = (event: EventState) => {
        const nextEvent = structuredClone(event);
        for (const day of nextEvent.days) for (const block of day.blocks) for (const role of blockRoles(block)) if (role.templateId === sourceId) Object.assign(role, { templateId: targetId, templateRevision: target.revision || 1, customized: isRoleSnapshotCustomized({ name: role.name, description: role.description, color: blockRoleColor(role) }, { ...target, color: target.color || roleColor(target.name) }) });
        return nextEvent;
      };
      const next = relinkEvent(data);
      setData(next);
      setEventLibrary((events) => events.map((event) => event.eventId === next.eventId ? next : relinkEvent(event)));
      setRoleTemplates((current) => current.filter((role) => role.id !== sourceId));
      setRoleTemplateEditor(null);
      setToast(`${source.name} merged into ${target.name}. ${payload.updatedEvents ?? 0} event${payload.updatedEvents === 1 ? "" : "s"} relinked.`);
      window.setTimeout(() => setToast(""), 3200);
    } catch (error) {
      showError(`Roles could not be merged: ${error instanceof Error ? error.message : "Unable to merge these roles."}`);
    }
  };

  const replaceMasterFromRole = async (blockId: string, blockRoleId: string) => {
    const block = activeDay.blocks.find((item) => item.id === blockId);
    const role = block && blockRoles(block).find((item) => item.id === blockRoleId);
    if (!role?.templateId) return;
    const confirmed = await requestConfirmation({
      title: `Replace master “${role.name}”?`,
      message: "The master responsibilities and colour will be replaced with this event version. Copies already used in other events stay unchanged.",
      confirmLabel: "Replace master",
      cancelLabel: "Keep master",
      tone: "danger",
    });
    if (!confirmed) return;
    try {
      const saved = await persistRoleTemplate({ id: role.templateId, name: role.name, description: role.description, color: blockRoleColor(role), normalizedName: normalizeRoleName(role.name), revision: role.templateRevision });
      setRoleTemplates((current) => [...current.filter((item) => item.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)));
      const next = structuredClone(data);
      const current = next.days.flatMap((day) => day.blocks).flatMap((item) => blockRoles(item)).find((item) => item.id === blockRoleId);
      if (current) Object.assign(current, { templateRevision: saved.revision, customized: false });
      next.draftChanges += 1;
      setRoleEditor(null);
      void save(next, `${saved.name} replaced in the master library.`);
    } catch (error) {
      showError(`Master role could not be replaced: ${error instanceof Error ? error.message : "Unable to replace this template."}`);
    }
  };

  const promoteRoleToLibrary = async (blockId: string, blockRoleId: string) => {
    const block = activeDay.blocks.find((item) => item.id === blockId);
    const role = block && blockRoles(block).find((item) => item.id === blockRoleId);
    if (!role) return;
    try {
      let saved: RoleTemplate;
      try {
        saved = await persistRoleTemplate({ id: `${roleTemplateId(role.name)}-${Date.now()}`, name: role.name, description: role.description, color: blockRoleColor(role) });
      } catch (error) {
        const existing = (error as Error & { existing?: RoleTemplate }).existing;
        if (!existing) throw error;
        const confirmed = await requestConfirmation({
          title: `Replace master “${existing.name}”?`,
          message: "A master role with this name already exists. Its responsibilities and colour will be replaced with this event version; copies already used in other events stay unchanged.",
          confirmLabel: "Replace master",
          cancelLabel: "Keep existing role",
          tone: "danger",
        });
        if (!confirmed) return;
        saved = await persistRoleTemplate({ ...existing, name: role.name, description: role.description, color: blockRoleColor(role) }, true);
      }
      setRoleTemplates((current) => [...current.filter((item) => item.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)));
      const next = structuredClone(data);
      const current = next.days.flatMap((day) => day.blocks).flatMap((item) => blockRoles(item)).find((item) => item.id === blockRoleId);
      if (current) Object.assign(current, { templateId: saved.id, templateRevision: saved.revision, customized: false });
      next.draftChanges += 1;
      setRoleEditor(null);
      void save(next, `${saved.name} added to the master library.`);
    } catch (error) {
      showError(`Role could not be added to the library: ${error instanceof Error ? error.message : "Unable to save this role."}`);
    }
  };

  const saveEventSettings = (prepEnabled: boolean, judgingEnabled: boolean) => {
    const next = { ...structuredClone(data), prepEnabled, judgingEnabled, draftChanges: data.draftChanges + 1 };
    if ((!prepEnabled && section === "prep") || (!judgingEnabled && section === "judging")) setSection("settings");
    void save(next, "Event modules updated.");
  };

  const saveOverview = (resources: Resource[], contacts: ImportantContact[]) => {
    const next = structuredClone(data);
    next.resources = resources;
    next.contacts = contacts;
    next.draftChanges += 1;
    void save(next, "Event overview updated for directors and execs.");
  };

  const savePrep = (sessions: PrepSession[], tasks: PrepTask[], availability: Record<string, Record<string, AvailabilityStatus>>) => {
    const next = structuredClone(data);
    next.prepSessions = sessions.filter((session) => session.label.trim()).map((session) => ({ ...session, label: session.label.trim(), location: session.location.trim() }));
    next.prepTasks = tasks.filter((task) => task.label.trim()).map((task) => ({ ...task, label: task.label.trim(), notes: task.notes.trim() }));
    for (const person of next.people) person.prepAvailability = Object.fromEntries(next.prepSessions.map((session) => [session.id, availability[person.id]?.[session.id] ?? "available"]));
    next.draftChanges += 1;
    void save(next, "Prep mini-compendium updated.");
  };

  const sharePrep = async () => {
    if (!data.relayMeta?.shareToken) return showError("Save the event once before sharing prep.");
    const url = new URL(`/exec/${data.relayMeta.shareToken}`, window.location.origin);
    url.searchParams.set("view", "prep");
    try {
      await navigator.clipboard.writeText(url.toString());
      setToast("Prep link copied. Send it to everyone helping before the event.");
      window.setTimeout(() => setToast(""), 2400);
    } catch {
      setShareLink({ title: "Share prep", message: "Copy this link and send it to everyone helping before the event.", url: url.toString() });
    }
  };

  const startNewEvent = (values: { name: string; type: string; venue: string; startDate: string; dayCount: number }) => {
    const next = createBlankEvent(values, data.people);
    setShowNewEvent(false);
    setShowEventLibrary(false);
    setDayId(next.days[0].id);
    setSection("schedule");
    setBoardLocked(window.localStorage.getItem(`relay:v1:board-locked:${next.eventId}`) === "true");
    setSelectedRoles({});
    void save(next, "New event created. Add your first schedule block.");
  };

  const switchEvent = (event: EventState) => {
    setData(normalizeEvent(event));
    setPublishedData(null);
    setDayId(event.days[0].id);
    setShowEventLibrary(false);
    setSection("schedule");
    setBoardLocked(window.localStorage.getItem(`relay:v1:board-locked:${event.eventId}`) === "true");
    setSelectedRoles({});
  };

  const cycleJudgingStatus = (roomId: string, slotIndex: number) => {
    const next = structuredClone(data);
    const slot = next.judgingRooms.find((room) => room.id === roomId)!.slots[slotIndex];
    const order: JudgingRoom["slots"][number]["status"][] = ["Waiting", "Presenting", "Done", "Dropped"];
    slot.status = order[(order.indexOf(slot.status) + 1) % order.length];
    next.draftChanges += 1;
    void save(next, `${slot.team} marked ${slot.status.toLowerCase()}.`);
  };

  const visibleDirectorSections: [Section, string][] = [["schedule", "Schedule"]];
  if (data.prepEnabled) visibleDirectorSections.push(["prep", "Prep"]);
  visibleDirectorSections.push(["people", "People + availability"], ["roles", "Roles + instructions"]);
  if (data.judgingEnabled) visibleDirectorSections.push(["judging", "Judging rooms"]);
  visibleDirectorSections.push(["resources", "Event overview"]);
  const directorSections = visibleDirectorSections.map(([id, label], index): [Section, string, string] => [id, label, String(index + 2).padStart(2, "0")]);
  const roleRemovalDay = roleRemoval ? data.days.find((day) => day.id === roleRemoval.dayId) : undefined;
  const roleRemovalBlock = roleRemovalDay?.blocks.find((block) => block.id === roleRemoval?.blockId);
  const roleRemovalRole = roleRemovalBlock && roleRemoval ? blockRoles(roleRemovalBlock).find((role) => role.id === roleRemoval.blockRoleId) : undefined;
  const roleRemovalAssignmentCount = roleRemovalDay && roleRemoval ? roleRemovalDay.assignments.filter((assignment) => assignment.blockId === roleRemoval.blockId && assignment.blockRoleId === roleRemoval.blockRoleId).length : 0;

  if (mode === "exec" && !publishedData) {
    return <main className="exec-loading" aria-busy="true"><header><div className="exec-brand"><span>R</span> relay</div><div className="exec-loading-profile"><i /><span /></div></header><section className="exec-loading-body" role="status" aria-label="Loading Exec View"><div className="exec-loading-kicker" /><div className="exec-loading-title" /><div className="exec-loading-subtitle" /><div className="exec-loading-days"><i /><i /></div><div className="exec-loading-section"><div /><span /></div><div className="exec-loading-roles">{[0, 1, 2, 3].map((item) => <article key={item}><time /><i /><div><span /><strong /><small /></div></article>)}</div><p>Preparing your published roles<span>…</span></p></section></main>;
  }

  return (
    <div className={`app-shell ${mode === "exec" ? "exec-shell" : ""} ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      {mode === "director" ? (
        <>
          <aside className="sidebar">
            <button className="brand" onClick={() => setSection("schedule")} aria-label="Relay home"><span>R</span> relay</button>
            <button className="sidebar-collapse" onClick={() => setSidebarCollapsed((current) => !current)} aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"} title={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}>{sidebarCollapsed ? "›" : "‹"}</button>
            <button className="event-mini" onClick={() => setShowEventLibrary(true)}><span className="event-mark">{data.eventName.slice(0, 2).toUpperCase()}</span><div><strong>{data.eventName}</strong><small>{data.dateRange}</small></div><span aria-hidden="true">⌄</span></button>
            <nav aria-label="Director workspace">
              <button onClick={() => void openExecView()} disabled={loadingPublished}><span>01</span>{loadingPublished ? "Loading exec view…" : "Exec view"}</button>
              {directorSections.map(([id, label, number]) => (
                <button key={id} className={section === id ? "active" : ""} onClick={() => setSection(id)}><span>{number}</span>{label}{id === "schedule" && warnings.length > 0 ? <b>{warnings.length}</b> : null}</button>
              ))}
            </nav>
            <div className="sidebar-bottom"><button className={section === "settings" ? "active" : ""} onClick={() => setSection("settings")}><span aria-hidden="true">⚙</span>Settings</button></div>
          </aside>
          <main className="workspace">
            <header className="workspace-header">
              <div><div className="eyebrow">{data.eventType} · {data.venue}</div><h1>{data.eventName}</h1><p>{data.dateRange} <span>•</span> Status: {publication.status}{publication.isPublished ? <> <span>•</span> {publication.activity}</> : null}{data.draftChanges ? <> <span>•</span> {data.draftChanges} edit{data.draftChanges === 1 ? "" : "s"} ahead</> : null}</p>{data.relayMeta?.updatedBy ? <small className="audit-line">Last edited by {data.relayMeta.updatedBy}{data.relayMeta.updatedAt ? ` · ${new Date(data.relayMeta.updatedAt).toLocaleString()}` : ""}{data.relayMeta.publishedBy ? ` · Published by ${data.relayMeta.publishedBy}` : ""}</small> : null}</div>
              <div className="header-actions"><span className={`save-state ${saving ? "saving" : ""}`}>{publishing ? "Publishing…" : saving ? "Saving…" : hydrated ? "All changes saved" : "Connecting…"}</span><button className="button primary" onClick={() => void publish()} disabled={data.draftChanges === 0 || publishing}>{publishing ? "Publishing…" : `Publish ${data.draftChanges ? `${data.draftChanges} changes` : "changes"}`}</button><button className="button text-button" onClick={() => void signOut({ callbackUrl: "/" })} title={portalUser.email}>Sign out</button></div>
            </header>

            {section === "schedule" && <ScheduleView data={data} activeDay={activeDay} dayId={dayId} setDayId={setDayId} warnings={warnings} reviewTarget={scheduleReviewTarget} selectedRoles={selectedRoles} boardLocked={boardLocked} roleTemplates={roleTemplates} onToggleLock={toggleBoardLock} onSelectRole={toggleSelectedRole} onCell={changeAssignment} onAssignRole={assignBlockRoleToPerson} onEditInterval={(assignment) => setAssignmentIntervalEditor({ blockId: assignment.blockId, personId: assignment.personId, blockRoleId: assignment.blockRoleId, assignmentId: assignment.id })} onClearAssignment={clearAssignment} onMoveAssignment={moveAssignment} onAddRole={addScheduleRoleToBlock} onCreateRole={createAndAddRole} onEditRole={(blockId, blockRoleId) => setRoleEditor({ blockId, blockRoleId })} onRemoveRole={requestBlockRoleRemoval} onAssignRest={assignRestToOnCall} onAddBlock={() => setBlockEditor({})} onImport={() => setShowScheduleImport(true)} onEditBlock={(blockId) => setBlockEditor({ blockId })} onDuplicateBlock={duplicateBlock} onDeleteBlock={setDeleteBlockId} onReview={reviewScheduleCheck} onViewAll={() => setShowScheduleChecks(true)} />}
            {section === "prep" && <PrepView data={data} onSave={savePrep} onShare={sharePrep} />}
            {section === "people" && <PeopleView data={data} activeDay={activeDay} dayId={dayId} setDayId={setDayId} onAvailability={cycleBlockAvailability} />}
            {section === "roles" && <RolesView data={data} activeDay={activeDay} dayId={dayId} setDayId={setDayId} roleTemplates={roleTemplates} onOpen={(blockId, blockRoleId) => setRoleEditor({ blockId, blockRoleId })} onEditBlock={(blockId) => setBlockEditor({ blockId })} onAddRoleToBlock={addLibraryRoleToBlock} onCreateRole={() => setRoleTemplateEditor({})} onEditRole={(templateId) => setRoleTemplateEditor({ templateId })} onImport={() => setShowRoleImport(true)} />}
            {section === "judging" && <JudgingView data={data} onCycle={cycleJudgingStatus} />}
            {section === "resources" && <ResourcesView data={data} onSave={saveOverview} />}
            {section === "settings" && <SettingsView data={data} onSave={saveEventSettings} onManageRoster={() => setShowRoster(true)} />}
          </main>
          {roleEditor && <RoleEditor data={data} day={activeDay} editor={roleEditor} roleTemplates={roleTemplates} onClose={() => setRoleEditor(null)} onSave={saveRoleEdit} onRemove={removeRoleFromBlock} onReplaceMaster={() => void replaceMasterFromRole(roleEditor.blockId, roleEditor.blockRoleId)} onPromote={() => void promoteRoleToLibrary(roleEditor.blockId, roleEditor.blockRoleId)} />}
          {assignmentIntervalEditor ? (() => {
            const block = activeDay.blocks.find((item) => item.id === assignmentIntervalEditor.blockId);
            const person = data.people.find((item) => item.id === assignmentIntervalEditor.personId);
            const role = block ? blockRoles(block).find((item) => item.id === assignmentIntervalEditor.blockRoleId) : undefined;
            const assignment = assignmentIntervalEditor.assignmentId ? activeDay.assignments.find((item) => item.id === assignmentIntervalEditor.assignmentId) : undefined;
            return block && person && role ? <AssignmentIntervalDialog day={activeDay} block={block} person={person} role={role} assignment={assignment} onClose={() => setAssignmentIntervalEditor(null)} onSave={(start, end) => { setAssignmentIntervalEditor(null); commitBlockRoleAssignment(block.id, person.id, role.id, { start, end }); }} /> : null;
          })() : null}
          {blockEditor && <BlockEditor day={activeDay} blockId={blockEditor.blockId} onClose={() => setBlockEditor(null)} onSave={saveBlock} />}
          {showNewEvent && <NewEventDialog onClose={() => setShowNewEvent(false)} onCreate={startNewEvent} />}
          {showEventLibrary && <EventLibraryDialog events={eventLibrary} currentId={data.eventId} onClose={() => setShowEventLibrary(false)} onSwitch={switchEvent} onNew={() => { setShowEventLibrary(false); setShowNewEvent(true); }} />}
          {showScheduleImport && <ScheduleImportDialog day={activeDay} onClose={() => setShowScheduleImport(false)} onImport={importSchedule} />}
          {showRoleImport && <RoleImportDialog roleTemplates={roleTemplates} onClose={() => setShowRoleImport(false)} onImport={importRoleTemplates} />}
          {showRoster && <RosterDialog data={data} onClose={() => setShowRoster(false)} onSave={saveRoster} />}
          {roleTemplateEditor && <RoleTemplateDialog key={roleTemplateEditor.templateId ?? "new-role"} roleLibrary={roleTemplates} templateId={roleTemplateEditor.templateId} onClose={() => setRoleTemplateEditor(null)} onSave={saveRoleTemplate} onDelete={deleteRoleTemplate} onMerge={mergeRoleTemplates} onOpenExisting={(templateId) => setRoleTemplateEditor({ templateId })} />}
          {showScheduleChecks && <ScheduleChecksDialog checks={warnings} loading={!hydrated} error={loadError} onReview={reviewScheduleCheck} onClose={() => setShowScheduleChecks(false)} />}
          {deleteBlockId && activeDay.blocks.some((block) => block.id === deleteBlockId) ? <DeleteBlockDialog block={activeDay.blocks.find((block) => block.id === deleteBlockId)!} assignmentCount={activeDay.assignments.filter((assignment) => assignment.blockId === deleteBlockId).length} onClose={() => setDeleteBlockId(null)} onConfirm={() => deleteBlock(deleteBlockId)} /> : null}
          {roleRemovalBlock && roleRemovalRole ? <RemoveRoleDialog block={roleRemovalBlock} role={roleRemovalRole} assignmentCount={roleRemovalAssignmentCount} onClose={() => setRoleRemoval(null)} onConfirm={removeBlockRole} /> : null}
        </>
      ) : (
        publishedData ? <PublishedExecView data={publishedData} person={publishedData.people.find((person) => person.id === execPersonId) ?? publishedData.people[0]!} dayId={dayId} setDayId={setDayId} onPersonChange={changeExecPerson} onExit={exitExecView} /> : null
      )}
      {confirmation ? <ConfirmationDialog request={confirmation} onCancel={() => resolveConfirmation(false)} onConfirm={() => resolveConfirmation(true)} /> : null}
      {shareLink ? <ShareLinkDialog shareLink={shareLink} onClose={() => setShareLink(null)} onCopied={() => { setShareLink(null); setToast("Link copied."); window.setTimeout(() => setToast(""), 2400); }} /> : null}
      {toast ? <div className={`toast ${toastError ? "error" : ""}`} role={toastError ? "alert" : "status"}><span>{toastError ? "!" : "✓"}</span>{toast}{!toastError && undoState ? <button onClick={() => { const previous = undoState; setUndoState(null); void save(previous, "Change undone."); }}>Undo</button> : null}</div> : null}
    </div>
  );
}

function ConfirmationDialog({ request, onCancel, onConfirm }: { request: ConfirmationRequest; onCancel: () => void; onConfirm: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onCancel(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onCancel]);
  return <div className="drawer-backdrop centered" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}><section className="setup-dialog confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirmation-title" aria-describedby="confirmation-message"><header><div><h2 id="confirmation-title">{request.title}</h2><p id="confirmation-message">{request.message}</p></div><button onClick={onCancel} aria-label="Close">×</button></header><footer><button className="button secondary" onClick={onCancel}>{request.cancelLabel ?? "Cancel"}</button><button className={`button ${request.tone === "danger" ? "danger" : "primary"}`} onClick={onConfirm} autoFocus>{request.confirmLabel}</button></footer></section></div>;
}

function AssignmentIntervalDialog({ day, block, person, role, assignment, onClose, onSave }: { day: EventDay; block: EventBlock; person: Person; role: BlockRole; assignment?: Assignment; onClose: () => void; onSave: (start: string, end: string) => void }) {
  const freeSlots = person.availabilitySlots?.[day.id] ?? {};
  const slots = getAvailabilitySlots(day).filter((slot) => slot.start < eventTimeToMinutes(block.end) && slot.end > eventTimeToMinutes(block.start));
  const availableIntervals = getAvailableAssignmentIntervals(block, day, freeSlots);
  const recommended = [...availableIntervals].sort((first, second) => (second.end - second.start) - (first.end - first.start))[0];
  const fullInterval = assignmentInterval(undefined, block);
  const existingInterval = assignment ? assignmentInterval(assignment, block) : null;
  const initialInterval = existingInterval ?? recommended ?? fullInterval;
  const initialMode = existingInterval
    ? existingInterval.start === fullInterval.start && existingInterval.end === fullInterval.end ? "full" : "custom"
    : recommended && (recommended.start !== fullInterval.start || recommended.end !== fullInterval.end) ? "recommended" : "full";
  const [mode, setMode] = useState<"full" | "recommended" | "custom">(initialMode);
  const [start, setStart] = useState(() => assignmentTimeValue(initialInterval.start));
  const [end, setEnd] = useState(() => assignmentTimeValue(initialInterval.end));
  const boundaries = Array.from(new Set([fullInterval.start, ...slots.flatMap((slot) => [Math.max(slot.start, fullInterval.start), Math.min(slot.end, fullInterval.end)]), fullInterval.end])).filter((value) => value >= fullInterval.start && value <= fullInterval.end).sort((first, second) => first - second);
  const selectedInterval = assignmentInterval({ start, end }, block);
  const selectedAvailability = assignmentAvailabilityFromSlots(block, day, freeSlots, { start, end });
  const choose = (nextMode: "full" | "recommended" | "custom", interval?: { start: number; end: number }) => {
    setMode(nextMode);
    if (interval) {
      setStart(assignmentTimeValue(interval.start));
      setEnd(assignmentTimeValue(interval.end));
    }
  };
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  return <div className="drawer-backdrop centered" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="setup-dialog interval-dialog" role="dialog" aria-modal="true" aria-labelledby="interval-dialog-title">
    <header><div><span className="kicker">{block.label} · {role.name}</span><h2 id="interval-dialog-title">Assign {person.name}</h2><p>Choose one continuous interval. Relay fills every included 30-minute availability block.</p></div><button onClick={onClose} aria-label="Close">×</button></header>
    <div className="interval-dialog-body">
      <div className="interval-choice-list">
        <button type="button" className={mode === "full" ? "selected" : ""} onClick={() => choose("full", fullInterval)}><span aria-hidden="true" /><div><strong>Entire event</strong><small>{formatEventTime(fullInterval.start)}–{formatEventTime(fullInterval.end)}</small></div><b>{assignmentAvailabilityFromSlots(block, day, freeSlots) === "available" ? "Available" : "Includes unavailable time"}</b></button>
        {recommended ? <button type="button" className={mode === "recommended" ? "selected" : ""} onClick={() => choose("recommended", recommended)}><span aria-hidden="true" /><div><strong>Available interval</strong><small>{formatEventTime(recommended.start)}–{formatEventTime(recommended.end)}</small></div><b>Recommended</b></button> : null}
        <button type="button" className={mode === "custom" ? "selected" : ""} onClick={() => setMode("custom")}><span aria-hidden="true" /><div><strong>Custom interval</strong><small>Choose exact start and end blocks</small></div><b>Manual</b></button>
      </div>
      <div className="interval-custom-fields" data-active={mode === "custom"}>
        <label>Start<select value={start} onChange={(event) => { setMode("custom"); setStart(event.target.value); if (eventTimeToMinutes(event.target.value) >= eventTimeToMinutes(end)) setEnd(assignmentTimeValue(boundaries.find((value) => value > eventTimeToMinutes(event.target.value)) ?? fullInterval.end)); }}>{boundaries.slice(0, -1).map((value) => <option value={assignmentTimeValue(value)} key={`start-${value}`}>{formatEventTime(value)}</option>)}</select></label>
        <span>→</span>
        <label>End<select value={end} onChange={(event) => { setMode("custom"); setEnd(event.target.value); }}>{boundaries.filter((value) => value > eventTimeToMinutes(start)).map((value) => <option value={assignmentTimeValue(value)} key={`end-${value}`}>{formatEventTime(value)}</option>)}</select></label>
      </div>
      <div className="interval-slot-preview" style={{ "--interval-slots": slots.length } as React.CSSProperties}>{slots.map((slot) => {
        const selected = slot.start < selectedInterval.end && slot.end > selectedInterval.start;
        const available = freeSlots[slot.key] === true;
        return <div className={`${available ? "available" : "unavailable"} ${selected ? "selected" : ""}`} key={slot.key}><strong>{slot.label}</strong><span>{available ? "Available" : "Unavailable"}</span></div>;
      })}</div>
      <p className={`interval-status ${selectedAvailability}`}>{selectedAvailability === "available" ? "This interval is fully available." : selectedAvailability === "conditional" ? "This interval includes both available and unavailable blocks." : "This interval is marked unavailable."}</p>
    </div>
    <footer><button className="button secondary" onClick={onClose}>Cancel</button><button className={`button ${selectedAvailability === "available" ? "primary" : "danger"}`} onClick={() => onSave(start, end)}>{assignment ? "Save assignment time" : selectedAvailability === "available" ? "Assign interval" : "Assign anyway"}</button></footer>
  </section></div>;
}

function ShareLinkDialog({ shareLink, onClose, onCopied }: { shareLink: ShareLink; onClose: () => void; onCopied: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.select();
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareLink.url);
      onCopied();
    } catch {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  };
  return <div className="drawer-backdrop centered" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="setup-dialog share-link-dialog" role="dialog" aria-modal="true" aria-labelledby="share-link-title"><header><div><span className="kicker">Share link</span><h2 id="share-link-title">{shareLink.title}</h2><p>{shareLink.message}</p></div><button onClick={onClose} aria-label="Close">×</button></header><div className="share-link-body"><label>Link<input ref={inputRef} value={shareLink.url} readOnly onFocus={(event) => event.currentTarget.select()} /></label><p>Select the link and copy it manually if your browser blocks the copy button.</p></div><footer><button className="button secondary" onClick={onClose}>Close</button><button className="button primary" onClick={copy}>Copy link</button></footer></section></div>;
}

function DayToggle({ data, dayId, setDayId }: { data: EventState; dayId: string; setDayId: (id: string) => void }) {
  return <div className="day-toggle" aria-label="Event day">{data.days.map((day) => <button key={day.id} className={dayId === day.id ? "active" : ""} onClick={() => setDayId(day.id)}>{day.label}<small>{day.date.replace(/^[A-Za-z]+, /, "")}</small></button>)}</div>;
}

function ScheduleView({ data, activeDay, dayId, setDayId, warnings, reviewTarget, selectedRoles, boardLocked, roleTemplates, onToggleLock, onSelectRole, onCell, onAssignRole, onEditInterval, onClearAssignment, onMoveAssignment, onAddRole, onCreateRole, onEditRole, onRemoveRole, onAssignRest, onAddBlock, onImport, onEditBlock, onDuplicateBlock, onDeleteBlock, onReview, onViewAll }: { data: EventState; activeDay: EventDay; dayId: string; setDayId: (id: string) => void; warnings: ScheduleCheck[]; reviewTarget: { dayId: string; blockId: string; personId: string; nonce: number } | null; selectedRoles: Record<string, string>; boardLocked: boolean; roleTemplates: RoleTemplate[]; onToggleLock: () => void; onSelectRole: (blockId: string, blockRoleId: string) => void; onCell: (blockId: string, personId: string) => void; onAssignRole: (blockId: string, personId: string, blockRoleId: string) => void; onEditInterval: (assignment: Assignment) => void; onClearAssignment: (assignmentId: string) => void; onMoveAssignment: (assignmentId: string, targetBlockId: string, targetPersonId: string) => void; onAddRole: (blockId: string, template: RoleTemplate, personId?: string) => void; onCreateRole: (blockId: string, name: string, color: string, saveToLibrary: boolean, personId?: string) => void; onEditRole: (blockId: string, blockRoleId: string) => void; onRemoveRole: (blockId: string, blockRoleId: string) => void; onAssignRest: (blockId: string, blockRoleId: string) => void; onAddBlock: () => void; onImport: () => void; onEditBlock: (blockId: string) => void; onDuplicateBlock: (blockId: string) => void; onDeleteBlock: (blockId: string) => void; onReview: (check: ScheduleCheck) => void; onViewAll: () => void }) {
  const [boardFocused, setBoardFocused] = useState(false);
  const [rolePicker, setRolePicker] = useState<{ blockId: string; personId: string; anchor: { left: number; top: number; bottom: number; width: number } } | null>(null);
  const [dragTarget, setDragTarget] = useState<{ blockId: string; personId: string } | null>(null);
  const [draggingAssignmentId, setDraggingAssignmentId] = useState<string | null>(null);
  const dragGestureRef = useRef<{ assignmentId: string; startX: number; startY: number; moved: boolean } | null>(null);
  const suppressAssignmentClickRef = useRef(false);
  const moveAssignmentRef = useRef(onMoveAssignment);
  const openRolePickerBelow = (element: HTMLElement, blockId: string, personId: string) => {
    if (rolePicker?.blockId === blockId && rolePicker.personId === personId) { setRolePicker(null); return; }
    element.scrollIntoView({ block: "center", inline: "nearest" });
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const rect = element.getBoundingClientRect();
      setRolePicker({ blockId, personId, anchor: { left: rect.left, top: rect.top, bottom: rect.bottom, width: rect.width } });
    }));
  };
  useEffect(() => { moveAssignmentRef.current = onMoveAssignment; }, [onMoveAssignment]);
  useEffect(() => {
    document.body.classList.toggle("schedule-focus-active", boardFocused);
    const exitFocus = (event: KeyboardEvent) => { if (event.key === "Escape") setBoardFocused(false); };
    window.addEventListener("keydown", exitFocus);
    return () => {
      document.body.classList.remove("schedule-focus-active");
      window.removeEventListener("keydown", exitFocus);
    };
  }, [boardFocused]);
  useEffect(() => {
    if (!reviewTarget || reviewTarget.dayId !== activeDay.id) return;
    const timeout = window.setTimeout(() => {
      const target = Array.from(document.querySelectorAll<HTMLElement>(".assignment-cell")).find((cell) => cell.dataset.blockId === reviewTarget.blockId && cell.dataset.personId === reviewTarget.personId);
      target?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      target?.querySelector<HTMLButtonElement>(".assignment-cell-target")?.focus({ preventScroll: true });
    }, 80);
    return () => window.clearTimeout(timeout);
  }, [activeDay.id, reviewTarget]);
  useEffect(() => {
    const findTarget = (clientX: number, clientY: number) => document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>(".assignment-cell");
    const handlePointerMove = (event: PointerEvent) => {
      const gesture = dragGestureRef.current;
      if (!gesture) return;
      if (!gesture.moved && Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) < 7) return;
      gesture.moved = true;
      setDraggingAssignmentId(gesture.assignmentId);
      const target = findTarget(event.clientX, event.clientY);
      setDragTarget(target?.dataset.blockId && target.dataset.personId ? { blockId: target.dataset.blockId, personId: target.dataset.personId } : null);
      event.preventDefault();
    };
    const handlePointerUp = (event: PointerEvent) => {
      const gesture = dragGestureRef.current;
      dragGestureRef.current = null;
      setDraggingAssignmentId(null);
      setDragTarget(null);
      if (!gesture?.moved) return;
      const target = findTarget(event.clientX, event.clientY);
      if (target?.dataset.blockId && target.dataset.personId) moveAssignmentRef.current(gesture.assignmentId, target.dataset.blockId, target.dataset.personId);
      suppressAssignmentClickRef.current = true;
      window.setTimeout(() => { suppressAssignmentClickRef.current = false; }, 0);
      event.preventDefault();
    };
    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp, { passive: false });
    window.addEventListener("pointercancel", handlePointerUp, { passive: false });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, []);
  if (!activeDay.blocks.length) return <div className="content schedule-content"><div className="section-title"><div><span className="kicker">Schedule</span><h2>Add the event schedule</h2><p>Import a day from Google Docs or add blocks manually. Locations can be filled in later.</p></div><DayToggle data={data} dayId={dayId} setDayId={setDayId} /></div><section className="empty-builder"><span>01</span><h3>No blocks yet</h3><p>Paste a table or time-based schedule from the planning document.</p><div className="empty-actions"><button className="button primary" onClick={onImport}>Import</button><button className="button secondary" onClick={onAddBlock}>+ Add block</button></div></section></div>;
  const blocks = sortBlocks(activeDay.blocks);
  const timeframes = blocks.reduce<{ start: string; end: string; blocks: EventBlock[] }[]>((groups, block) => {
    const current = groups.at(-1);
    if (current && timeToMinutes(current.start) === timeToMinutes(block.start)) {
      current.blocks.push(block);
      if (timeToMinutes(block.end) > timeToMinutes(current.end)) current.end = block.end;
    } else groups.push({ start: block.start, end: block.end, blocks: [block] });
    return groups;
  }, []);
  return <div className="content schedule-content">
    <div className="section-title"><div><span className="kicker">Schedule</span><h2>{activeDay.label}</h2><p>Assign people, manage roles, or edit a block.</p></div><div className="schedule-actions"><DayToggle data={data} dayId={dayId} setDayId={setDayId} /><button className="button secondary" onClick={onImport}>Import</button><button className="button secondary" onClick={onAddBlock}>+ Add block</button></div></div>
    <section className={`board-card ${boardFocused ? "focused" : ""}`}>
      <div className="board-toolbar"><div><strong>{activeDay.date}</strong><span>{blocks[0].start} – {blocks.reduce((latest, block) => timeToMinutes(block.end) > timeToMinutes(latest) ? block.end : latest, blocks[0].end)}</span></div><div className="board-toolbar-actions"><div className="legend"><span><i className="legend-dot available" />Available</span><span><i className="legend-dot conditional" />Conditional</span><span><i className="legend-dot conflict" />Conflict</span></div><button className="board-focus" aria-pressed={boardFocused} onClick={() => setBoardFocused((current) => !current)}>{boardFocused ? "× Exit full screen" : "⛶ Full screen"}</button><button className={`board-lock ${boardLocked ? "locked" : ""}`} onClick={onToggleLock}>{boardLocked ? "▣ Locked" : "◉ Unlocked"}</button></div></div>
      <div className="timeline-scroll">
        <div className="timeline" style={{ "--columns": blocks.length } as React.CSSProperties}>
          <div className="timeline-corner">Person</div>
          {timeframes.map((timeframe) => <div className="timeframe-head" key={`${timeframe.start}-${timeframe.end}`} style={{ gridColumn: `span ${timeframe.blocks.length}` }}><strong>{timeframe.start}–{timeframe.end}</strong><span>{timeframe.blocks.length > 1 ? `${timeframe.blocks.length} concurrent events` : "1 event"}</span></div>)}
          {blocks.map((block) => <BlockAssignmentHeader key={block.id} block={block} day={activeDay} people={data.people} selectedRoleId={selectedRoles[block.id] ?? ""} locked={boardLocked} roleTemplates={roleTemplates} onSelectRole={onSelectRole} onAddRole={onAddRole} onCreateRole={onCreateRole} onEditRole={onEditRole} onRemoveRole={onRemoveRole} onAssignRest={onAssignRest} onEditBlock={onEditBlock} onDuplicateBlock={onDuplicateBlock} onDeleteBlock={onDeleteBlock} />)}
          {data.people.map((person) => <div className="timeline-row" key={person.id}>
            <div className="person-cell"><PersonAvatar person={person} small /><div><strong>{person.name}</strong><small>{activeDay.assignments.filter((a) => a.personId === person.id).length} roles</small></div></div>
            {blocks.map((block) => {
              const assignment = activeDay.assignments.find((item) => item.personId === person.id && item.blockId === block.id);
              const conflict = findAssignmentConflict(activeDay, person.id, block.id, assignment?.id);
              const availability = conflict ? "unavailable" : person.availability[activeDay.id]?.[block.id] ?? "available";
              const roleAssignments = assignment ? activeDay.assignments.filter((item) => item.blockId === block.id && item.blockRoleId === assignment.blockRoleId) : [];
              const teammatePeople = Array.from(new Set(roleAssignments.filter((item) => item.personId !== person.id).map((item) => item.personId))).map((personId) => data.people.find((candidate) => candidate.id === personId)).filter((candidate): candidate is Person => Boolean(candidate));
              const teammates = teammatePeople.map((candidate) => candidate.name);
              const lead = assignment ? assignmentLeadName(assignment, data.people) : "";
              const assignmentTime = assignment ? assignmentTimeLabel(assignment, block) : "";
              const conflictReason = conflict ? `Unavailable: already assigned to ${conflict.block.label} (${conflict.block.start}–${conflict.block.end})` : "";
              const armed = Boolean(selectedRoles[block.id]) && !boardLocked;
              const isReviewTarget = reviewTarget?.dayId === activeDay.id && reviewTarget.blockId === block.id && reviewTarget.personId === person.id;
              const assignmentDetails = [assignmentTime, lead ? `Lead: ${lead}` : "", teammates.length ? `With ${teammates.join(", ")}` : ""].filter(Boolean).join(" · ");
              const assignmentLabel = [assignment?.role, lead ? `lead ${lead}` : "", teammates.length ? `with ${teammates.join(", ")}` : ""].filter(Boolean).join(", ");
              const pickerOpen = rolePicker?.blockId === block.id && rolePicker.personId === person.id;
              const isDragTarget = dragTarget?.blockId === block.id && dragTarget.personId === person.id;
              return <div className={`assignment-cell ${availability} ${armed ? "armed" : ""} ${boardLocked ? "locked" : ""} ${isReviewTarget ? "review-target" : ""} ${isDragTarget ? "drag-target" : ""} ${pickerOpen ? "picker-open" : ""}`} data-block-id={block.id} data-person-id={person.id} key={block.id}>
                <button className={`assignment-cell-target ${assignment && draggingAssignmentId === assignment.id ? "dragging" : ""}`} disabled={boardLocked} aria-grabbed={assignment ? draggingAssignmentId === assignment.id : undefined} onPointerDown={(event) => { if (!assignment || boardLocked || event.button !== 0) return; dragGestureRef.current = { assignmentId: assignment.id, startX: event.clientX, startY: event.clientY, moved: false }; }} onClick={(event) => { if (suppressAssignmentClickRef.current) return; if (selectedRoles[block.id]) onCell(block.id, person.id); else openRolePickerBelow(event.currentTarget, block.id, person.id); }} title={conflictReason || (assignment ? `${assignmentDetails || assignment.role} · Click to change role · Drag to move` : selectedRoles[block.id] ? "Assign selected role" : "Choose a role")} aria-label={`${person.name}, ${block.label}${conflictReason ? `, ${conflictReason}` : assignment ? `, ${assignmentLabel}, choose another role` : selectedRoles[block.id] ? ", assign selected role" : ", unassigned, choose a role"}`}>
                  {assignment ? <span className="role-chip" style={{ background: assignment.color || roleColor(assignment.role) }}><span><b>{assignment.role}</b><small>{assignmentTime}{lead ? ` · Lead: ${lead}` : ""}</small></span>{teammatePeople.length ? <span className="cell-teammates" aria-label={`Also assigned: ${teammates.join(", ")}`}>{teammatePeople.slice(0, 3).map((teammate) => <PersonAvatar person={teammate} small key={teammate.id} />)}{teammatePeople.length > 3 ? <b>+{teammatePeople.length - 3}</b> : null}</span> : null}<i aria-hidden="true">⋮⋮</i></span> : <span className="add-role" aria-hidden="true">+</span>}
                </button>
                {assignment && !boardLocked ? <button className="assignment-clear" onClick={() => onClearAssignment(assignment.id)} aria-label={`Clear ${assignment.role} from ${person.name}`} title="Clear assignment">×</button> : null}
                {pickerOpen && !boardLocked ? <RoleSearchPicker anchor={rolePicker.anchor} block={block} title={assignment ? `Change ${person.name}’s role` : `Assign ${person.name}`} people={data.people} assignments={activeDay.assignments} currentRoleId={assignment?.blockRoleId} roleTemplates={roleTemplates} onChooseRole={(blockRoleId) => { onAssignRole(block.id, person.id, blockRoleId); setRolePicker(null); }} onEditInterval={assignment ? () => { onEditInterval(assignment); setRolePicker(null); } : undefined} onClear={assignment ? () => { onClearAssignment(assignment.id); setRolePicker(null); } : undefined} onAdd={(template) => { onAddRole(block.id, template, person.id); setRolePicker(null); }} onCreate={(name, color, saveToLibrary) => { onCreateRole(block.id, name, color, saveToLibrary, person.id); setRolePicker(null); }} onClose={() => setRolePicker(null)} /> : null}
              </div>;
            })}
          </div>)}
        </div>
      </div>
    </section>
    <section className="attention-section"><div className="subhead"><div><span className="kicker">Human review</span><h3>Availability conflicts</h3><p>Only assignments that override someone’s unavailable status appear here.</p></div><button className="text-button" onClick={onViewAll}>Open review →</button></div><ScheduleChecksTable checks={warnings} limit={6} onReview={onReview} /></section>
  </div>;
}

function RoleSearchPicker({ anchor, block, title, people, assignments, currentRoleId, roleTemplates, onChooseRole, onEditInterval, onClear, onAdd, onCreate, onClose }: { anchor: { left: number; top: number; bottom: number; width: number }; block: EventBlock; title: string; people: Person[]; assignments: Assignment[]; currentRoleId?: string; roleTemplates: RoleTemplate[]; onChooseRole: (blockRoleId: string) => void; onEditInterval?: () => void; onClear?: () => void; onAdd: (template: RoleTemplate) => void; onCreate: (name: string, color: string, saveToLibrary: boolean) => void; onClose: () => void }) {
  const [search, setSearch] = useState("");
  const [newRoleColor, setNewRoleColor] = useState(() => nextRoleColor([...roleTemplates.map((role) => role.color), ...blockRoles(block).map((role) => role.color)]));
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [position, setPosition] = useState({ left: -1000, top: -1000, maxHeight: 430, visible: false });
  const pickerRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const roles = blockRoles(block);
  const normalizedSearch = search.trim().toLowerCase();
  const existingOptions = roles.filter((role) => `${role.name} ${role.description}`.toLowerCase().includes(normalizedSearch)).map((role) => ({ kind: "role" as const, id: role.id, name: role.name, description: role.description, role }));
  const libraryOptions = roleTemplates.filter((template) => !roles.some((role) => role.templateId === template.id || normalizeRoleName(role.name) === normalizeRoleName(template.name)) && `${template.name} ${template.description}`.toLowerCase().includes(normalizedSearch)).map((template) => ({ kind: "template" as const, id: template.id, name: template.name, description: template.description, template }));
  const options = [...existingOptions, ...libraryOptions].slice(0, 12);
  const exactMatch = [...roles, ...roleTemplates].some((role) => normalizeRoleName(role.name) === normalizeRoleName(normalizedSearch));
  const canCreate = Boolean(normalizedSearch) && !exactMatch;
  const optionCount = options.length + (canCreate ? 1 : 0);
  useLayoutEffect(() => {
    const picker = pickerRef.current;
    if (!picker) return;
    const width = picker.offsetWidth;
    const left = Math.min(Math.max(12, anchor.left + anchor.width / 2 - width / 2), window.innerWidth - width - 12);
    const top = anchor.bottom + 6;
    setPosition({ left, top, maxHeight: Math.max(180, Math.min(430, window.innerHeight - top - 12)), visible: true });
  }, [anchor, optionCount]);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => searchRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => { if (!pickerRef.current?.contains(event.target as Node)) onClose(); };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [onClose]);
  useLayoutEffect(() => keepHighlightedRoleVisible(listboxRef.current), [highlightedIndex]);
  const chooseOption = (index: number) => {
    const option = options[index];
    if (option?.kind === "role") {
      if (option.id !== currentRoleId) onChooseRole(option.id);
    } else if (option?.kind === "template") onAdd(option.template);
    else if (canCreate && index === options.length) onCreate(search.trim(), newRoleColor, false);
  };
  const picker = <div className="assignment-role-picker" ref={pickerRef} role="dialog" aria-label={`${title} in ${block.label}`} style={{ left: position.left, top: position.top, maxHeight: position.maxHeight, visibility: position.visible ? "visible" : "hidden" }}>
    <div className="assignment-role-picker-head"><div><strong>{title}</strong><small>{block.label}</small></div><button onClick={onClose} aria-label="Close role picker">×</button></div>
    <label><span>⌕</span><input ref={searchRef} autoFocus role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls={listboxId} aria-activedescendant={optionCount ? `${listboxId}-option-${Math.min(highlightedIndex, optionCount - 1)}` : undefined} value={search} onChange={(event) => { setSearch(event.target.value); setHighlightedIndex(0); }} onKeyDown={(event) => {
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) { event.preventDefault(); setHighlightedIndex((current) => moveRoleOptionIndex(current, optionCount, event.key as "ArrowDown" | "ArrowUp" | "Home" | "End")); }
      else if (event.key === "Enter") { event.preventDefault(); if (optionCount) chooseOption(Math.max(0, highlightedIndex)); }
      else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
    }} placeholder="Search or create a role…" /></label>
    <div className="assignment-role-options" id={listboxId} ref={listboxRef} role="listbox">{options.map((option, index) => {
      const roleMembers = option.kind === "role" ? Array.from(new Set(assignments.filter((assignment) => assignment.blockId === block.id && assignment.blockRoleId === option.id).map((assignment) => assignment.personId))).map((personId) => people.find((candidate) => candidate.id === personId)).filter((candidate): candidate is Person => Boolean(candidate)) : [];
      const isCurrent = option.kind === "role" && currentRoleId === option.id;
      return <button id={`${listboxId}-option-${index}`} role="option" aria-selected={highlightedIndex === index} aria-disabled={isCurrent} data-current={isCurrent} data-highlighted={highlightedIndex === index} key={`${option.kind}-${option.id}`} onMouseEnter={() => setHighlightedIndex(index)} onClick={() => chooseOption(index)}><i style={{ background: option.kind === "role" ? blockRoleColor(option.role) : option.template.color || roleColor(option.name) }} /><span><strong>{option.name}</strong><small>{option.kind === "role" ? `${roleMembers.length} assigned · Already in this block` : option.description || "Add to this block"}</small></span>{option.kind === "role" ? <span className="picker-member-stack">{roleMembers.slice(0, 3).map((member) => <PersonAvatar person={member} small key={member.id} />)}{roleMembers.length > 3 ? <b>+{roleMembers.length - 3}</b> : null}</span> : null}<b>{isCurrent ? "Current" : option.kind === "role" ? "Assign" : "Add"}</b></button>;
    })}{canCreate ? <div className="create-role-option" id={`${listboxId}-option-${options.length}`} role="option" aria-selected={highlightedIndex === options.length} data-highlighted={highlightedIndex === options.length} onMouseEnter={() => setHighlightedIndex(options.length)}><input type="color" value={newRoleColor} onChange={(event) => setNewRoleColor(event.target.value)} aria-label="New role color" /><div><strong>Create “{search.trim()}”</strong><span><button onClick={() => onCreate(search.trim(), newRoleColor, false)}>Add to this event</button><button onClick={() => onCreate(search.trim(), newRoleColor, true)}>Add to event + library</button></span></div></div> : null}{!options.length && !canCreate ? <p>No matching roles.</p> : null}</div>
    <div className="assignment-role-picker-actions"><span>↑↓ choose · Enter assign · Esc close</span>{onEditInterval ? <button onClick={onEditInterval}>Edit time</button> : null}{onClear ? <button className="danger" onClick={onClear}>Remove assignment</button> : null}</div>
  </div>;
  return createPortal(picker, document.body);
}

function ScheduleChecksTable({ checks, limit, onReview }: { checks: ScheduleCheck[]; limit?: number; onReview?: (check: ScheduleCheck) => void }) {
  const visibleChecks = typeof limit === "number" ? checks.slice(0, limit) : checks;
  return <div className="checks-table" role="table" aria-label="Availability conflicts">
    <div className="checks-table-head" role="row"><span role="columnheader">Status</span><span role="columnheader">Person</span><span role="columnheader">Schedule</span><span role="columnheader">Role</span></div>
    {visibleChecks.map((check, index) => <button type="button" className="checks-table-row" role="row" aria-label={`Review ${check.title} in schedule`} onClick={() => onReview?.(check)} disabled={!onReview || !check.dayId || !check.blockId || !check.personId} key={`${check.title}-${index}`}><span role="cell"><b className="warning-type w-unavailable">{check.level}</b></span><strong role="cell">{check.person ?? check.title}</strong><span role="cell">{check.schedule ?? check.detail}</span><span className="checks-table-action" role="cell"><span>{check.role ?? "Assigned role"}</span><b>→</b></span></button>)}
    {visibleChecks.length < checks.length ? <div className="checks-table-more">Showing {visibleChecks.length} of {checks.length} conflicts · Open review to see all</div> : null}
    {!checks.length ? <div className="checks-table-empty"><span>✓</span><div><strong>No availability conflicts</strong><p>Every assigned interval is fully available.</p></div></div> : null}
  </div>;
}

function ScheduleChecksDialog({ checks, loading, error, onReview, onClose }: { checks: ScheduleCheck[]; loading: boolean; error: string; onReview: (check: ScheduleCheck) => void; onClose: () => void }) {
  const view = getScheduleChecksViewState(checks, loading, error);
  return <div className="drawer-backdrop centered" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="setup-dialog checks-dialog" role="dialog" aria-modal="true" aria-label="Availability conflicts"><header><div><span className="kicker">Human review</span><h2>Availability conflicts</h2><p>{view.phase === "loading" ? "Checking the shared schedule…" : view.phase === "empty" ? "No unavailable people are assigned." : `${view.checks.length} unavailable assignment${view.checks.length === 1 ? "" : "s"} across the event.`}</p></div><button onClick={onClose} aria-label="Close">×</button></header><div className="checks-dialog-body">{view.error ? <div className="checks-error" role="alert"><strong>Shared event data could not be refreshed.</strong><p>{view.error} The checks below reflect the schedule currently on screen.</p></div> : null}{view.phase === "loading" ? <div className="checks-state" role="status"><span className="checks-spinner" /><h3>Checking availability</h3><p>Your schedule stays open while Relay checks assignments.</p></div> : <ScheduleChecksTable checks={view.checks} onReview={onReview} />}</div><footer><button className="button primary" onClick={onClose}>Return to scheduling</button></footer></section></div>;
}

function DeleteBlockDialog({ block, assignmentCount, onClose, onConfirm }: { block: EventBlock; assignmentCount: number; onClose: () => void; onConfirm: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  return <div className="drawer-backdrop centered" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="setup-dialog confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-block-title" aria-describedby="delete-block-description"><header><div><span className="kicker">Delete schedule block</span><h2 id="delete-block-title">Remove “{block.label}”?</h2><p id="delete-block-description">This removes the block and {assignmentCount ? `${assignmentCount} assignment${assignmentCount === 1 ? "" : "s"}` : "its role setup"}. People’s time-based availability will be kept.</p></div><button onClick={onClose} aria-label="Close">×</button></header><div className="confirm-dialog-body"><span aria-hidden="true">!</span><div><strong>This change affects the whole schedule.</strong><p>You can use Undo immediately after deleting if you change your mind.</p></div></div><footer><button className="button secondary" onClick={onClose}>Keep block</button><button className="button danger" onClick={onConfirm} autoFocus>Delete block</button></footer></section></div>;
}

function RemoveRoleDialog({ block, role, assignmentCount, onClose, onConfirm }: { block: EventBlock; role: BlockRole; assignmentCount: number; onClose: () => void; onConfirm: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  return <div className="drawer-backdrop centered" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="setup-dialog confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="remove-role-title" aria-describedby="remove-role-description" onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}><header><div><span className="kicker">Remove block role</span><h2 id="remove-role-title">Remove “{role.name}”?</h2><p id="remove-role-description">This removes the role from {block.label}{assignmentCount ? ` and unassigns ${assignmentCount} ${assignmentCount === 1 ? "person" : "people"}` : ""}. Their availability and other assignments will stay unchanged.</p></div><button onClick={onClose} aria-label="Close">×</button></header><div className="confirm-dialog-body"><span aria-hidden="true">!</span><div><strong>This change only affects {block.label}.</strong><p>You can use Undo immediately after removing the role if you change your mind.</p></div></div><footer><button className="button secondary" onClick={onClose}>Keep role</button><button className="button danger" onClick={onConfirm} autoFocus>Remove role</button></footer></section></div>;
}

function PrepView({ data, onSave, onShare }: { data: EventState; onSave: (sessions: PrepSession[], tasks: PrepTask[], availability: Record<string, Record<string, AvailabilityStatus>>) => void; onShare: () => void }) {
  const [sessions, setSessions] = useState<PrepSession[]>(() => structuredClone(data.prepSessions));
  const [tasks, setTasks] = useState<PrepTask[]>(() => structuredClone(data.prepTasks));
  const [availability, setAvailability] = useState<Record<string, Record<string, AvailabilityStatus>>>(() => Object.fromEntries(data.people.map((person) => [person.id, structuredClone(person.prepAvailability)])));
  const updateSession = (id: string, patch: Partial<PrepSession>) => setSessions((current) => current.map((session) => session.id === id ? { ...session, ...patch } : session));
  const updateTask = (id: string, patch: Partial<PrepTask>) => setTasks((current) => current.map((task) => task.id === id ? { ...task, ...patch } : task));
  const cycleAvailability = (personId: string, sessionId: string) => setAvailability((current) => {
    const next = structuredClone(current);
    next[personId] ??= {};
    const status = next[personId][sessionId] ?? "available";
    next[personId][sessionId] = status === "available" ? "conditional" : status === "conditional" ? "unavailable" : "available";
    return next;
  });
  return <div className="content"><div className="section-title compact"><div><span className="kicker">Before the event</span><h2>Prep mini-compendium</h2><p>Plan the working sessions, collect availability, and keep every packing, printing, and walkthrough task in one place.</p></div><div className="prep-header-actions"><button className="button secondary" onClick={onShare}>Share prep</button><button className="button primary" onClick={() => onSave(sessions, tasks, availability)}>Save prep plan</button></div></div><div className="prep-summary"><div><strong>{sessions.length}</strong><span>prep sessions</span></div><div><strong>{tasks.filter((task) => task.done).length}/{tasks.length}</strong><span>tasks complete</span></div><div><strong>{new Set(tasks.map((task) => task.ownerPersonId).filter(Boolean)).size}</strong><span>people owning work</span></div></div><div className="prep-workspace"><section className="prep-panel"><div className="form-section-head"><div><h3>Prep sessions</h3><p>Usually scheduled a few days before the event.</p></div><button onClick={() => setSessions((current) => [...current, { id: `prep-session-${Date.now()}`, label: "New prep session", date: "", start: "5:00 PM", end: "7:00 PM", location: "" }])}>+ Add session</button></div><div className="prep-session-list">{sessions.map((session) => <article key={session.id}><input value={session.label} aria-label="Session name" onChange={(event) => updateSession(session.id, { label: event.target.value })} /><input type="date" value={session.date} aria-label={`${session.label} date`} onChange={(event) => updateSession(session.id, { date: event.target.value })} /><input value={session.start} aria-label={`${session.label} start time`} onChange={(event) => updateSession(session.id, { start: event.target.value })} /><input value={session.end} aria-label={`${session.label} end time`} onChange={(event) => updateSession(session.id, { end: event.target.value })} /><input value={session.location} placeholder="Location" aria-label={`${session.label} location`} onChange={(event) => updateSession(session.id, { location: event.target.value })} /><button onClick={() => { setSessions((current) => current.filter((item) => item.id !== session.id)); setTasks((current) => current.map((task) => task.sessionId === session.id ? { ...task, sessionId: "" } : task)); }} aria-label={`Remove ${session.label}`}>×</button></article>)}</div></section><section className="prep-panel prep-tasks"><div className="form-section-head"><div><h3>Prep checklist</h3><p>This becomes the working mini-compendium for the prep team.</p></div><button onClick={() => setTasks((current) => [...current, { id: `prep-task-${Date.now()}`, label: "New prep task", done: false, ownerPersonId: "", sessionId: sessions[0]?.id ?? "", notes: "" }])}>+ Add task</button></div><div className="prep-task-list">{tasks.map((task) => <article className={task.done ? "done" : ""} key={task.id}><input type="checkbox" checked={task.done} aria-label={`Mark ${task.label} complete`} onChange={(event) => updateTask(task.id, { done: event.target.checked })} /><div><input value={task.label} aria-label="Task" onChange={(event) => updateTask(task.id, { label: event.target.value })} /><input value={task.notes} placeholder="Instructions or items needed" aria-label={`${task.label} notes`} onChange={(event) => updateTask(task.id, { notes: event.target.value })} /></div><select value={task.ownerPersonId} aria-label={`${task.label} owner`} onChange={(event) => updateTask(task.id, { ownerPersonId: event.target.value })}><option value="">No owner</option>{data.people.map((person) => <option value={person.id} key={person.id}>{person.name}</option>)}</select><select value={task.sessionId} aria-label={`${task.label} session`} onChange={(event) => updateTask(task.id, { sessionId: event.target.value })}><option value="">No session</option>{sessions.map((session) => <option value={session.id} key={session.id}>{session.label}</option>)}</select><button onClick={() => setTasks((current) => current.filter((item) => item.id !== task.id))} aria-label={`Remove ${task.label}`}>×</button></article>)}</div></section></div><section className="prep-panel prep-availability"><div className="form-section-head"><div><h3>Prep availability</h3><p>Click a cell to cycle through available, conditional, and unavailable.</p></div></div>{sessions.length ? <div className="availability-scroll"><div className="prep-availability-grid" style={{ "--prep-columns": sessions.length } as React.CSSProperties}><div className="availability-corner">Exec</div>{sessions.map((session) => <div className="availability-head" key={session.id}><strong>{session.label}</strong><small>{session.date || "Date TBD"} · {session.start}</small></div>)}{data.people.map((person) => <div className="availability-row" key={person.id}><div className="availability-person"><PersonAvatar person={person} small /><div><strong>{person.name}</strong><small>{person.team}</small></div></div>{sessions.map((session) => { const status = availability[person.id]?.[session.id] ?? "available"; return <button key={session.id} className={`availability-block ${status}`} onClick={() => cycleAvailability(person.id, session.id)}><span>{status === "available" ? "✓" : status === "conditional" ? "~" : "×"}</span></button>; })}</div>)}</div></div> : <p className="empty-copy">Add a prep session to collect availability.</p>}</section></div>;
}

function PeopleView({ data, activeDay, dayId, setDayId, onAvailability }: { data: EventState; activeDay: EventDay; dayId: string; setDayId: (id: string) => void; onAvailability: (personId: string, blockId: string) => void }) {
  const alphabetizedPeople = sortPeopleAlphabetically(data.people);
  return <div className="content"><div className="section-title compact"><div><span className="kicker">People</span><h2>Event availability</h2><p>The universal roster is managed in Settings. Availability stays specific to this event and maps automatically to schedule blocks.</p></div><DayToggle data={data} dayId={dayId} setDayId={setDayId} /></div>
    <section className="availability-card"><div className="availability-scroll"><div className="availability-grid" style={{ "--columns": activeDay.blocks.length } as React.CSSProperties}><div className="availability-corner">Exec</div>{activeDay.blocks.map((block) => <div className="availability-head" key={block.id}><strong>{block.short}</strong><small>{block.start}–{block.end}</small></div>)}{alphabetizedPeople.map((person) => <div className="availability-row" key={person.id}><div className="availability-person"><PersonAvatar person={person} small /><div><strong>{person.name}</strong><small>{person.team}</small></div></div>{activeDay.blocks.map((block) => { const status = person.availability[activeDay.id]?.[block.id] ?? "unavailable"; const label = status === "available" ? "Free for the full block" : status === "conditional" ? "Free for part of the block" : "Not free for this block"; return <button type="button" key={block.id} className={`availability-block ${status}`} title={`${block.label}: ${label}. Click to change.`} aria-label={`${person.name}, ${block.label}: ${label}. Click to change.`} onClick={() => onAvailability(person.id, block.id)}><span>{status === "available" ? "✓" : status === "conditional" ? "~" : "×"}</span></button>; })}</div>)}</div></div></section>
  </div>;
}

function BlockAssignmentHeader({ block, day, people, selectedRoleId, locked, roleTemplates, onSelectRole, onAddRole, onCreateRole, onEditRole, onRemoveRole, onAssignRest, onEditBlock, onDuplicateBlock, onDeleteBlock }: { block: EventBlock; day: EventDay; people: Person[]; selectedRoleId: string; locked: boolean; roleTemplates: RoleTemplate[]; onSelectRole: (blockId: string, blockRoleId: string) => void; onAddRole: (blockId: string, template: RoleTemplate) => void; onCreateRole: (blockId: string, name: string, color: string, saveToLibrary: boolean) => void; onEditRole: (blockId: string, blockRoleId: string) => void; onRemoveRole: (blockId: string, blockRoleId: string) => void; onAssignRest: (blockId: string, blockRoleId: string) => void; onEditBlock: (blockId: string) => void; onDuplicateBlock: (blockId: string) => void; onDeleteBlock: (blockId: string) => void }) {
  const [pickerAnchor, setPickerAnchor] = useState<{ left: number; top: number; bottom: number; width: number } | null>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const roles = blockRoles(block);
  const selectedRole = roles.find((role) => role.id === selectedRoleId);
  const handleRoleChipKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    const chips = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>(".block-role-select:not(:disabled)"));
    const currentIndex = chips.indexOf(event.target as HTMLButtonElement);
    if (currentIndex < 0) return;
    event.preventDefault();
    const backwards = event.key === "ArrowLeft" || event.key === "ArrowUp";
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? chips.length - 1 : (currentIndex + (backwards ? -1 : 1) + chips.length) % chips.length;
    chips[nextIndex]?.focus();
  };
  return <div className={`block-head assignment-ready ${selectedRole ? "active" : ""} ${locked ? "locked" : ""}`} style={{ background: block.color }}>
    <button className="block-details" onClick={() => onEditBlock(block.id)} aria-label={`Edit ${block.label} details`}><small>{block.start}–{block.end}</small><strong>{block.label}</strong><span>{block.location} · {roles.length} role{roles.length === 1 ? "" : "s"}</span></button>
    <button className="duplicate-block" onClick={() => onDuplicateBlock(block.id)} aria-label={`Duplicate ${block.label}`} title="Duplicate block">⧉</button>
    <button className="delete-block" onClick={() => onDeleteBlock(block.id)} aria-label={`Delete ${block.label}`} title="Delete block">×</button>
    <div className="block-role-chips" onKeyDown={handleRoleChipKeys}>{roles.map((role) => {
      const count = day.assignments.filter((assignment) => assignment.blockId === block.id && assignment.blockRoleId === role.id).length;
      return <span className="block-role-chip" key={role.id} style={{ "--role-color": blockRoleColor(role) } as React.CSSProperties}><button className="block-role-select" disabled={locked} aria-pressed={selectedRoleId === role.id} onClick={() => onSelectRole(block.id, role.id)}><span>{role.name}</span><b>{count}</b></button><button className="block-role-remove" disabled={locked} onClick={() => onRemoveRole(block.id, role.id)} aria-label={`Remove ${role.name} from ${block.label}`} title={`Remove ${role.name}`}>×</button></span>;
    })}</div>
    <div className="block-role-actions"><button ref={addButtonRef} className="role-add-button" disabled={locked} onClick={(event) => { if (pickerAnchor) { setPickerAnchor(null); return; } const rect = event.currentTarget.getBoundingClientRect(); setPickerAnchor({ left: rect.left, top: rect.top, bottom: rect.bottom, width: rect.width }); }} aria-expanded={Boolean(pickerAnchor)} aria-label={`Add role to ${block.label}`}>+</button><button disabled={locked || !selectedRole} onClick={() => selectedRole && onEditRole(block.id, selectedRole.id)}>Edit role</button>{selectedRole?.name === "On Call" ? <button onClick={() => onAssignRest(block.id, selectedRole.id)}>Assign available rest</button> : null}<span>{locked ? "Board locked" : selectedRole ? `${selectedRole.name} selected · Esc to clear` : "No role selected"}</span></div>
    {pickerAnchor && !locked ? <RoleSearchPicker anchor={pickerAnchor} block={block} title="Add or select a role" people={people} assignments={day.assignments} currentRoleId={selectedRoleId || undefined} roleTemplates={roleTemplates} onChooseRole={(roleId) => { onSelectRole(block.id, roleId); setPickerAnchor(null); }} onAdd={(template) => { onAddRole(block.id, template); setPickerAnchor(null); }} onCreate={(name, color, saveToLibrary) => { onCreateRole(block.id, name, color, saveToLibrary); setPickerAnchor(null); }} onClose={() => { setPickerAnchor(null); window.requestAnimationFrame(() => addButtonRef.current?.focus()); }} /> : null}
  </div>;
}

function RolesView({ data, activeDay, dayId, setDayId, roleTemplates, onOpen, onEditBlock, onAddRoleToBlock, onCreateRole, onEditRole, onImport }: { data: EventState; activeDay: EventDay; dayId: string; setDayId: (id: string) => void; roleTemplates: RoleTemplate[]; onOpen: (blockId: string, blockRoleId: string) => void; onEditBlock: (blockId: string) => void; onAddRoleToBlock: (templateId: string, blockId: string) => void; onCreateRole: () => void; onEditRole: (templateId: string) => void; onImport: () => void }) {
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim().toLowerCase();
  const visibleTemplates = roleTemplates.filter((template) => `${template.name} ${template.description}`.toLowerCase().includes(normalizedSearch));
  return <div className="content"><div className="section-title compact"><div><span className="kicker">Roles</span><h2>Reusable roles and block instructions</h2><p>Master roles are shared across events. Drag in a copy, then tailor it for this event without changing the master.</p></div><DayToggle data={data} dayId={dayId} setDayId={setDayId} /></div><div className="roles-workspace"><aside className="role-library"><header><div><span className="kicker">Master list</span><h3>Role library</h3><p>Search or drag a reusable role into a schedule block.</p></div><div className="role-library-actions"><button onClick={onImport}>Import</button><button onClick={onCreateRole}>+ New role</button></div></header><label className="role-library-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search master roles…" /></label><div>{visibleTemplates.map((template) => {
    const usedIn = data.days.flatMap((day) => day.blocks.filter((block) => blockRoles(block).some((role) => role.templateId === template.id)).map((block) => `${day.label} · ${block.label}`));
    return <article key={template.id} draggable onDragStart={(event) => { event.dataTransfer.setData("text/relay-role-id", template.id); event.dataTransfer.effectAllowed = "copy"; }}><i style={{ background: template.color || roleColor(template.name) }} /><div><strong>{template.name}</strong><p>{template.description}</p><small>{usedIn.length ? `Used in ${usedIn.length} block${usedIn.length === 1 ? "" : "s"}` : "Not used in this event"}</small></div><button onClick={() => onEditRole(template.id)} aria-label={`Edit ${template.name}`}>Edit</button></article>;
  })}{!visibleTemplates.length ? <p className="empty-copy">{search ? "No master roles match this search." : "Create or import your first reusable role."}</p> : null}</div></aside><section className="role-block-column">{activeDay.blocks.length === 0 ? <section className="empty-builder"><h3>No blocks yet</h3><p>Add a schedule block first, then drag roles into it.</p></section> : <div className="role-blocks">{sortBlocks(activeDay.blocks).map((block) => {
    const roles = blockRoles(block);
    return <section className="role-drop-zone" key={block.id} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }} onDrop={(event) => { event.preventDefault(); onAddRoleToBlock(event.dataTransfer.getData("text/relay-role-id"), block.id); }}><header style={{ background: block.color }}><div><small>{block.start}–{block.end}</small><h3>{block.label}</h3><span>{roles.length} role{roles.length === 1 ? "" : "s"}</span></div><div className="block-header-actions"><button onClick={() => onEditBlock(block.id)}>Edit block</button></div></header><div className="role-list">{roles.map((role) => {
      const assigned = activeDay.assignments.filter((assignment) => assignment.blockId === block.id && assignment.blockRoleId === role.id);
      const lead = data.people.find((person) => person.id === role.leadPersonId);
      const linkedTemplate = roleTemplates.some((template) => template.id === role.templateId);
      return <button key={role.id} onClick={() => onOpen(block.id, role.id)}><i style={{ background: blockRoleColor(role) }} /><div><strong>{role.name}{linkedTemplate ? <em className={role.customized ? "customized" : ""}>{role.customized ? "Customized" : "Library"}</em> : null}</strong><p>{role.description}</p><small>{lead ? `Lead: ${lead.name} · ` : ""}{assigned.length} assigned</small></div><span className="member-stack">{assigned.slice(0, 3).map((assignment) => <PersonAvatar person={data.people.find((person) => person.id === assignment.personId)!} small key={assignment.id} />)}<b>{assigned.length ? assigned.map((assignment) => data.people.find((person) => person.id === assignment.personId)?.name).join(", ") : "No members assigned"}</b></span><span>→</span></button>;
    })}{!roles.length ? <div className="empty-role-drop">Drag a master role here, or add an event-only role from Schedule.</div> : null}</div></section>;
  })}</div>}</section></div></div>;
}

function JudgingView({ data, onCycle }: { data: EventState; onCycle: (roomId: string, slotIndex: number) => void }) {
  return <div className="content"><div className="section-title compact"><div><span className="kicker">Competition module</span><h2>Five rooms. One live picture.</h2><p>Tap a team to move it from waiting to presenting, done, or dropped. Staff and room assignments stay tied to the master schedule.</p></div><div className="judging-legend"><span className="status-waiting">Waiting</span><span className="status-presenting">Presenting</span><span className="status-done">Done</span></div></div><div className="judging-grid">{data.judgingRooms.map((room) => <article key={room.id}><header><span>ROOM {room.id.split("-")[1]}</span><h3>{room.room}</h3><p>{room.judges}</p></header><div className="room-staff"><b>Timekeeper · Assistant · Dev</b><span>{room.staff}</span></div><div className="judging-slots">{room.slots.map((slot, index) => <button key={`${slot.time}-${slot.team}`} onClick={() => onCycle(room.id, index)} className={`status-${slot.status.toLowerCase()}`}><span>{slot.time}</span><strong>{slot.team}</strong><small>{slot.status}</small></button>)}</div></article>)}</div></div>;
}

function ResourceGroupField({ value, groups, onChange }: { value: string; groups: string[]; onChange: (value: string) => void }) {
  const [creating, setCreating] = useState(false);
  const [newGroup, setNewGroup] = useState("");
  const saveGroup = () => {
    const clean = newGroup.trim();
    if (!clean) return;
    onChange(clean);
    setNewGroup("");
    setCreating(false);
  };
  if (creating) return <div className="category-create"><input value={newGroup} onChange={(event) => setNewGroup(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); saveGroup(); } else if (event.key === "Escape") setCreating(false); }} placeholder="New category" aria-label="New resource category" autoFocus /><button type="button" onClick={saveGroup}>Add</button></div>;
  return <select value={value} aria-label="Resource category" onChange={(event) => { if (event.target.value === "__new__") setCreating(true); else onChange(event.target.value); }}><option value="" disabled>Choose category</option>{groups.map((group) => <option key={group} value={group}>{group}</option>)}<option value="__new__">+ Add new category…</option></select>;
}

function ResourcesView({ data, onSave }: { data: EventState; onSave: (resources: Resource[], contacts: ImportantContact[]) => void }) {
  const [editing, setEditing] = useState(false);
  const [resources, setResources] = useState<Resource[]>(() => structuredClone(data.resources));
  const [contacts, setContacts] = useState<ImportantContact[]>(() => structuredClone(data.contacts));
  const resourceGroups = Array.from(new Set([...standardResourceTemplate.map(([, group]) => group), ...resources.map((resource) => resource.group)].filter(Boolean)));
  const resourceItem = (resource: Resource) => resource.url ? <a href={resource.url} key={resource.id}><span>{resource.label}</span><b>Open ↗</b></a> : <div className="resource-placeholder" key={resource.id}><span>{resource.label}</span><b>Link needed</b></div>;
  if (editing) return <div className="content">
    <div className="section-title compact"><div><span className="kicker">Event overview</span><h2>Edit links and contacts</h2><p>The standard resource set is included automatically. Add links and mark the few items needed during the event.</p></div><div className="editor-actions"><button className="button secondary" onClick={() => { setResources(structuredClone(data.resources)); setContacts(structuredClone(data.contacts)); setEditing(false); }}>Cancel</button><button className="button primary" onClick={() => { onSave(resources.filter((item) => item.label.trim()), contacts.filter((item) => item.name.trim() && item.phone.trim())); setEditing(false); }}>Save overview</button></div></div>
    <div className="overview-editor"><section><div className="form-section-head"><div><h3>Event resources</h3><p>Choose an existing category or create a new one when you need it.</p></div><button onClick={() => setResources((current) => [...current, { id: `resource-${Date.now()}`, label: "", group: "Core", url: "", dayOf: false }])}>+ Add resource</button></div><div className="overview-builder resources">{resources.map((resource, index) => <div key={resource.id}><input value={resource.label} placeholder="Document name" onChange={(event) => setResources((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} /><ResourceGroupField value={resource.group} groups={resourceGroups} onChange={(group) => setResources((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, group } : item))} /><input value={resource.url} placeholder="https://…" onChange={(event) => setResources((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, url: event.target.value } : item))} /><select value={resource.dayOf ? "day-of" : "library"} onChange={(event) => setResources((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, dayOf: event.target.value === "day-of" } : item))}><option value="day-of">Day-of</option><option value="library">Library</option></select><button onClick={() => setResources((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${resource.label || "resource"}`}>×</button></div>)}</div></section><section><div className="form-section-head"><div><h3>Important people</h3><p>Names and phone numbers execs may need during the event.</p></div><button onClick={() => setContacts((current) => [...current, { id: `contact-${Date.now()}`, name: "", role: "", phone: "" }])}>+ Add person</button></div><div className="overview-builder contacts">{contacts.map((contact, index) => <div key={contact.id}><input value={contact.name} placeholder="Name" onChange={(event) => setContacts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} /><input value={contact.role} placeholder="Role" onChange={(event) => setContacts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, role: event.target.value } : item))} /><input value={contact.phone} placeholder="Phone" onChange={(event) => setContacts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, phone: event.target.value } : item))} /><button onClick={() => setContacts((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${contact.name || "contact"}`}>×</button></div>)}</div></section></div>
  </div>;
  const dayOf = data.resources.filter((resource) => resource.dayOf);
  const library = data.resources.filter((resource) => !resource.dayOf);
  const libraryGroups = Array.from(new Set(library.map((resource) => resource.group)));
  return <div className="content"><div className="section-title compact"><div><span className="kicker">Event overview</span><h2>Event home base</h2><p>Day-of essentials stay up front. Planning, participant, partner, feedback, and finance resources remain one click away.</p></div><button className="button primary" onClick={() => setEditing(true)}>Edit overview</button></div><div className="resource-home"><div className="overview-grid"><section className="overview-panel"><header><span>↗</span><div><h3>Day-of essentials</h3><p>{dayOf.length} resources pinned</p></div></header><div className="overview-group">{dayOf.map(resourceItem)}{!dayOf.length ? <p className="empty-copy">No day-of resources pinned yet.</p> : null}</div></section><section className="overview-panel"><header><span>☎</span><div><h3>Important people</h3><p>{data.contacts.length} contacts</p></div></header><div className="contact-list">{data.contacts.map((contact) => <a href={`tel:${contact.phone}`} key={contact.id}><div><strong>{contact.name}</strong><span>{contact.role}</span></div><b>{contact.phone}</b></a>)}{!data.contacts.length ? <p className="empty-copy">No contacts added yet.</p> : null}</div></section></div><section className="overview-panel event-library-panel"><header><span>≡</span><div><h3>Complete event library</h3><p>{library.length} planning and reference resources</p></div></header><div className="resource-category-grid">{libraryGroups.map((group) => <details key={group}><summary><span>{group}</span><b>{library.filter((resource) => resource.group === group).length}</b></summary><div className="overview-group">{library.filter((resource) => resource.group === group).map(resourceItem)}</div></details>)}</div></section></div></div>;
}

function EventLibraryDialog({ events, currentId, onClose, onSwitch, onNew }: { events: EventState[]; currentId: string; onClose: () => void; onSwitch: (event: EventState) => void; onNew: () => void }) {
  return <div className="drawer-backdrop centered" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="setup-dialog event-library" role="dialog" aria-modal="true" aria-label="Choose event"><header><div><span className="kicker">Your events</span><h2>Choose a workspace</h2></div><button onClick={onClose} aria-label="Close">×</button></header><div className="event-library-list">{events.map((event) => <button key={event.eventId} className={event.eventId === currentId ? "active" : ""} onClick={() => onSwitch(event)}><span className="event-mark">{event.eventName.slice(0, 2).toUpperCase()}</span><div><strong>{event.eventName}</strong><small>{event.eventType} · {event.dateRange} · {event.days.length} day{event.days.length === 1 ? "" : "s"}</small></div><b>{event.eventId === currentId ? "Current" : "Open →"}</b></button>)}</div><footer><button className="button primary" onClick={onNew}>+ Create new event</button></footer></section></div>;
}

function NewEventDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (values: { name: string; type: string; venue: string; startDate: string; dayCount: number }) => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("Conference");
  const [venue, setVenue] = useState("");
  const [startDate, setStartDate] = useState("");
  const [dayCountInput, setDayCountInput] = useState("1");
  const dayCount = validateDayCount(dayCountInput);
  const canCreate = Boolean(name.trim() && startDate.trim() && dayCount.value !== null);
  return <div className="drawer-backdrop centered" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="setup-dialog" role="dialog" aria-modal="true" aria-label="Create a new event"><header><div><span className="kicker">New event</span><h2>Start with a blank canvas.</h2><p>Relay will create the days. You decide every block, role, lead, link, and assignment.</p></div><button onClick={onClose} aria-label="Close">×</button></header><div className="setup-form"><label>Event name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. BluePrint 2027" autoFocus /></label><div className="form-row"><label>Event type<select value={type} onChange={(event) => setType(event.target.value)}><option>Conference</option><option>Competition</option><option>Workshop</option><option>Social</option><option>Other</option></select></label><label>Number of days<input type="number" min="1" max="7" step="1" value={dayCountInput} aria-invalid={Boolean(dayCount.error)} aria-describedby={dayCount.error ? "day-count-error" : undefined} onInput={(event) => setDayCountInput(event.currentTarget.value)} onBlur={(event) => setDayCountInput(event.currentTarget.value)} />{dayCount.error ? <small className="field-error" id="day-count-error" role="alert">{dayCount.error}</small> : null}</label></div><label>Venue<input value={venue} onChange={(event) => setVenue(event.target.value)} placeholder="Building, campus, or venue" /></label><label>First event date<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label></div><footer><button className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={!canCreate} onClick={() => { if (dayCount.value === null) return; onCreate({ name: name.trim(), type, venue: venue.trim() || "Venue TBD", startDate: startDate.trim(), dayCount: dayCount.value }); }}>Create blank event</button></footer></section></div>;
}

function ScheduleImportDialog({ day, onClose, onImport }: { day: EventDay; onClose: () => void; onImport: (blocks: EventBlock[], replace: boolean) => void }) {
  const [docUrl, setDocUrl] = useState("");
  const [text, setText] = useState("");
  const [replace, setReplace] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const blocks = useMemo(() => parseScheduleText(text, day.id), [text, day.id]);
  const loadDocument = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/google-doc-import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: docUrl }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to read that document");
      setText(payload.text);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to read that document");
    } finally {
      setLoading(false);
    }
  };
  return <div className="drawer-backdrop centered" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="setup-dialog import-dialog" role="dialog" aria-modal="true" aria-label="Import schedule from Google Docs"><header><div><span className="kicker">{day.label} · Google Docs</span><h2>Import schedule</h2><p>Use a public Google Doc link or paste rows copied from a document table.</p></div><button onClick={onClose} aria-label="Close">×</button></header><div className="import-form"><label>Public Google Doc link<div className="inline-field"><input value={docUrl} onChange={(event) => setDocUrl(event.target.value)} placeholder="https://docs.google.com/document/d/…" /><button className="button secondary" disabled={!docUrl.trim() || loading} onClick={loadDocument}>{loading ? "Reading…" : "Read document"}</button></div></label>{error ? <p className="form-error">{error} Paste the schedule below if the document is private.</p> : null}<label>Schedule table<textarea rows={10} value={text} onChange={(event) => setText(event.target.value)} placeholder={`Time\tEvent\tSecond event\n9:30 AM\tRegistration\t\n10:00 AM\tOpening Ceremony\t\n10:30 AM\tFireside Chat A\tCoffee Chats B`} /></label><p className="format-hint">Paste the table directly. Relay infers each end time from the next row and creates separate blocks for parallel events. Locations stay blank. Explicit start–end rows still work.</p><div className="import-preview"><strong>{blocks.length} block{blocks.length === 1 ? "" : "s"} found</strong>{blocks.slice(0, 6).map((block) => <span key={block.id}>{block.start}–{block.end} · {block.label}{block.location ? ` · ${block.location}` : " · location blank"}</span>)}</div><label className="check-row"><input type="checkbox" checked={replace} onChange={(event) => setReplace(event.target.checked)} /><span>Replace existing blocks and assignments for {day.label}</span></label></div><footer><button className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={!blocks.length} onClick={() => onImport(blocks, replace)}>Import {blocks.length || ""} block{blocks.length === 1 ? "" : "s"}</button></footer></section></div>;
}

function RosterDialog({ data, onClose, onSave }: { data: EventState; onClose: () => void; onSave: (people: Person[], groups: ExecGroup[]) => void }) {
  const [people, setPeople] = useState<Person[]>(() => sortPeopleAlphabetically(structuredClone(data.people)));
  const [groups, setGroups] = useState<ExecGroup[]>(() => structuredClone(data.groups));
  const [importText, setImportText] = useState("");
  const [newGroup, setNewGroup] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
  const [pendingDeleteGroupId, setPendingDeleteGroupId] = useState("");
  const updatePerson = (id: string, patch: Partial<Person>) => setPeople((current) => current.map((person) => person.id === id ? { ...person, ...patch } : person));
  const toggleSelected = (id: string) => setSelectedIds((current) => current.includes(id) ? current.filter((personId) => personId !== id) : [...current, id]);
  const confirmRosterDelete = () => {
    const deletedIds = new Set(pendingDeleteIds);
    setPeople((current) => current.filter((person) => !deletedIds.has(person.id)));
    setSelectedIds((current) => current.filter((personId) => !deletedIds.has(personId)));
    setPendingDeleteIds([]);
  };
  const confirmGroupDelete = () => {
    const groupId = pendingDeleteGroupId;
    setGroups((current) => current.filter((group) => group.id !== groupId));
    setPeople((current) => current.map((person) => person.groupIds.includes(groupId) ? { ...person, groupIds: [], team: "Unassigned" } : person));
    setPendingDeleteGroupId("");
  };
  const addGroup = (name: string) => {
    const clean = name.trim();
    if (!clean || groups.some((group) => group.name.toLowerCase() === clean.toLowerCase())) return groups.find((group) => group.name.toLowerCase() === clean.toLowerCase())?.id ?? "";
    const id = `${clean.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;
    setGroups((current) => [...current, { id, name: clean, color: "#d8d2ef" }]);
    return id;
  };
  const addPerson = () => {
    const id = `exec-${Date.now()}`;
    setPeople((current) => [...current, { id, name: "New exec", initials: "NE", team: groups[0]?.name ?? "Unassigned", color: "#d8d2ef", preferences: [], privateNote: "", phone: "", email: "", groupIds: groups[0] ? [groups[0].id] : [], availability: {}, prepAvailability: {} }]);
  };
  const importRoster = () => {
    const colorWheel = ["#ff8066", "#7f99ff", "#dfef79", "#b9a7ff", "#f8bb65", "#69c7b6"];
    const nextGroups = structuredClone(groups);
    const imported = importText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line, index) => {
      const [name = "", phone = "", email = "", groupNames = ""] = line.split(/\t|\s*,\s*/);
      const requestedGroup = groupNames.split(/[;+]/).map((item) => item.trim()).find(Boolean);
      const groupIds = requestedGroup ? [requestedGroup].map((groupName) => {
        let group = nextGroups.find((item) => item.name.toLowerCase() === groupName.toLowerCase());
        if (!group) {
          group = { id: `${groupName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}-${index}`, name: groupName, color: colorWheel[index % colorWheel.length] };
          nextGroups.push(group);
        }
        return group.id;
      }) : [];
      const id = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "exec"}-${Date.now()}-${index}`;
      return { id, name, initials: initialsFor(name), team: nextGroups.find((group) => groupIds.includes(group.id))?.name ?? "Unassigned", color: colorWheel[index % colorWheel.length], preferences: [], privateNote: "", phone, email, groupIds, availability: {}, prepAvailability: {} } satisfies Person;
    }).filter((person) => person.name);
    setGroups(nextGroups);
    setPeople((current) => sortPeopleAlphabetically([...current, ...imported.filter((person) => !current.some((existing) => Boolean(existing.email) && existing.email.toLowerCase() === person.email.toLowerCase() || existing.name.toLowerCase() === person.name.toLowerCase()))]));
    setImportText("");
  };
  const allSelected = people.length > 0 && selectedIds.length === people.length;
  const pendingGroup = groups.find((group) => group.id === pendingDeleteGroupId);
  const pendingGroupPeople = pendingGroup ? people.filter((person) => person.groupIds.includes(pendingGroup.id)).length : 0;
  return <div className="drawer-backdrop centered" onMouseDown={(event) => { if (event.target === event.currentTarget && !pendingDeleteIds.length && !pendingDeleteGroupId) onClose(); }}><section className="setup-dialog roster-dialog" role="dialog" aria-modal="true" aria-label="Manage universal roster"><header><div><span className="kicker">Organization settings</span><h2>Universal exec roster</h2><p>Names, contact details, and teams are shared across events. Deleting an exec also removes their event assignments.</p></div><button onClick={onClose} aria-label="Close">×</button></header><div className="roster-body"><section className="roster-import"><label>Import exec list<textarea rows={4} value={importText} onChange={(event) => setImportText(event.target.value)} placeholder={`Name, phone, email, team\nAlex Chen, 604-555-0100, alex@example.com, Development`} /></label><button className="button secondary" disabled={!importText.trim()} onClick={importRoster}>Add imported execs</button></section><section><div className="form-section-head"><div><h3>Teams</h3><p>Delete a team here to remove it across events. Its execs remain on the roster.</p></div><div className="inline-field"><input value={newGroup} onChange={(event) => setNewGroup(event.target.value)} placeholder="New team" /><button onClick={() => { addGroup(newGroup); setNewGroup(""); }}>Add</button></div></div><div className="group-chip-list">{groups.map((group) => <span style={{ background: group.color }} key={group.id}>{group.name}<button onClick={() => setPendingDeleteGroupId(group.id)} aria-label={`Delete team ${group.name}`} title={`Delete ${group.name}`}>×</button></span>)}</div></section><section><div className="form-section-head"><div><h3>{people.length} execs</h3><p>Edit shared details, delete one exec, or select several for bulk deletion.</p></div><button onClick={addPerson}>+ Add exec</button></div><div className="roster-list-toolbar"><label><input type="checkbox" checked={allSelected} onChange={() => setSelectedIds(allSelected ? [] : people.map((person) => person.id))} />Select all</label><span>{selectedIds.length ? `${selectedIds.length} selected` : "Select execs to make changes in bulk"}</span><button className="button danger" disabled={!selectedIds.length} onClick={() => setPendingDeleteIds(selectedIds)}>Delete selected{selectedIds.length ? ` (${selectedIds.length})` : ""}</button></div><div className="roster-list">{people.map((person) => <article key={person.id}><input className="roster-select" type="checkbox" checked={selectedIds.includes(person.id)} onChange={() => toggleSelected(person.id)} aria-label={`Select ${person.name}`} /><PersonAvatar person={person} /><div className="roster-fields"><input value={person.name} aria-label="Name" onChange={(event) => updatePerson(person.id, { name: event.target.value, initials: initialsFor(event.target.value) })} /><input value={person.phone} aria-label="Phone" placeholder="Phone" onChange={(event) => updatePerson(person.id, { phone: event.target.value })} /><input value={person.email} aria-label="Email" placeholder="Email" onChange={(event) => updatePerson(person.id, { email: event.target.value })} /></div><label className="person-team"><span>Team</span><select value={person.groupIds[0] ?? ""} onChange={(event) => updatePerson(person.id, { groupIds: event.target.value ? [event.target.value] : [] })}><option value="">Unassigned</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><button className="roster-delete" onClick={() => setPendingDeleteIds([person.id])} aria-label={`Delete ${person.name}`} title={`Delete ${person.name}`}>×</button></article>)}</div></section></div><footer><button className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={!people.some((person) => person.name.trim())} onClick={() => onSave(people.filter((person) => person.name.trim()), groups)}>Save universal roster</button></footer>{pendingDeleteIds.length ? <div className="roster-delete-confirmation" role="alertdialog" aria-modal="true" aria-labelledby="roster-delete-title"><div><span className="kicker">Permanent roster change</span><h3 id="roster-delete-title">Delete {pendingDeleteIds.length} exec{pendingDeleteIds.length === 1 ? "" : "s"}?</h3><p>This removes {pendingDeleteIds.length === 1 ? "this exec" : "these execs"} from the universal roster and removes their assignments from every event when you save.</p><div><button className="button secondary" onClick={() => setPendingDeleteIds([])}>Keep {pendingDeleteIds.length === 1 ? "exec" : "execs"}</button><button className="button danger" onClick={confirmRosterDelete}>Delete {pendingDeleteIds.length === 1 ? "exec" : `${pendingDeleteIds.length} execs`}</button></div></div></div> : null}{pendingGroup ? <div className="roster-delete-confirmation" role="alertdialog" aria-modal="true" aria-labelledby="group-delete-title"><div><span className="kicker">Universal team change</span><h3 id="group-delete-title">Delete {pendingGroup.name}?</h3><p>This removes the team across every event when you save. {pendingGroupPeople ? `${pendingGroupPeople} exec${pendingGroupPeople === 1 ? "" : "s"} will become unassigned; no execs or assignments will be deleted.` : "No execs are currently assigned to this team."}</p><div><button className="button secondary" onClick={() => setPendingDeleteGroupId("")}>Keep team</button><button className="button danger" onClick={confirmGroupDelete}>Delete team</button></div></div></div> : null}</section></div>;
}

function RoleTemplateDialog({ roleLibrary, templateId, onClose, onSave, onDelete, onMerge, onOpenExisting }: { roleLibrary: RoleTemplate[]; templateId?: string; onClose: () => void; onSave: (template: RoleTemplate) => void | Promise<void>; onDelete: (templateId: string) => void; onMerge: (sourceId: string, targetId: string) => void | Promise<void>; onOpenExisting: (templateId: string) => void }) {
  const existing = roleLibrary.find((template) => template.id === templateId);
  const [id] = useState(() => existing?.id ?? `role-template-${Date.now()}`);
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [color, setColor] = useState(() => existing?.color ?? nextRoleColor(roleLibrary.map((role) => role.color)));
  const similar = similarRoleTemplates(name, roleLibrary, existing?.id);
  const exactMatch = similar.find((candidate) => (candidate.normalizedName || normalizeRoleName(candidate.name)) === normalizeRoleName(name));
  const visibleMatches = exactMatch ? [exactMatch] : similar;
  const matchTitle = exactMatch ? existing ? "Role name already in use" : "Role already exists" : `Possible duplicate${visibleMatches.length === 1 ? "" : "s"}`;
  const matchCopy = exactMatch ? existing ? `“${exactMatch.name}” already uses this name. Merge the current role into it, or choose a different name.` : `“${exactMatch.name}” is already in the master role library. Open it to review or update its responsibilities.` : existing ? "If these roles mean the same thing, merge the current role into the one you want to keep." : "Review these similar roles before creating another master role.";
  return <div className="drawer-backdrop centered" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="setup-dialog profile-dialog" role="dialog" aria-modal="true" aria-label={`${existing ? "Edit" : "Create"} role template`}><header><div><span className="kicker">Master role library</span><h2>{existing ? existing.name : "Create a reusable role"}</h2><p>These responsibilities are copied into future events. Leads and event details stay with each block.</p></div><button onClick={onClose} aria-label="Close">×</button></header><div className="setup-form"><label>Role name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Food Server" autoFocus /></label>{visibleMatches.length ? <div className={`similar-role-warning ${exactMatch ? "exact-match" : ""}`} role={exactMatch ? "alert" : "status"}><div className="role-match-heading"><span aria-hidden="true">{exactMatch ? "!" : "?"}</span><div><strong>{matchTitle}</strong><p>{matchCopy}</p></div></div><div className="role-match-list">{visibleMatches.map((candidate) => <article key={candidate.id}><i style={{ background: candidate.color || roleColor(candidate.name) }} /><span><b>{candidate.name}</b><small>{candidate.description || "No responsibilities have been added yet."}</small></span><button type="button" onClick={() => existing ? void onMerge(existing.id, candidate.id) : onOpenExisting(candidate.id)}>{existing ? `Merge into ${candidate.name}` : "Open existing role"}</button></article>)}</div>{existing ? <p className="role-merge-note">The selected role stays in the library. Event-specific instructions, leads, and assignments remain unchanged.</p> : null}</div> : null}<label>Role color<div className="role-color-field"><input className="color-input" type="color" value={color} onChange={(event) => setColor(event.target.value)} /><span style={{ background: color }}>{name || "Role preview"}</span></div></label><label>Description of responsibilities<textarea rows={5} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What is this role generally responsible for across events?" /></label></div><footer>{existing ? <button className="button danger push-left" onClick={() => onDelete(existing.id)}>Delete role</button> : null}<button className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={!name.trim() || !description.trim() || Boolean(exactMatch)} onClick={() => void onSave({ id, name: name.trim(), description: description.trim(), color, normalizedName: normalizeRoleName(name), revision: existing?.revision || 1 })}>{exactMatch ? "Role already exists" : existing ? "Save master role" : "Create master role"}</button></footer></section></div>;
}

function RoleImportDialog({ roleTemplates, onClose, onImport }: { roleTemplates: RoleTemplate[]; onClose: () => void; onImport: (rows: RoleImportRow[]) => void | Promise<void> }) {
  const [rows, setRows] = useState<RoleImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const valid = rows.filter((row) => !row.error);
  const existingCount = valid.filter((row) => roleTemplates.some((role) => (role.normalizedName || normalizeRoleName(role.name)) === normalizeRoleName(row.name))).length;
  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([roleImportCsvTemplate], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "relay-master-role-library-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  };
  return <div className="drawer-backdrop centered" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="setup-dialog role-import-dialog" role="dialog" aria-modal="true" aria-label="Import master role library"><header><div><span className="kicker">Master role library</span><h2>Import reusable roles</h2><p>Upload the Relay CSV template. Existing role names update in place; new names create master roles.</p></div><button onClick={onClose} aria-label="Close">×</button></header><div className="setup-form"><button type="button" className="button secondary import-template-button" onClick={downloadTemplate}>Download CSV template</button><label className="role-import-file">Choose completed CSV<input type="file" accept=".csv,text/csv" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; setFileName(file.name); void file.text().then((source) => setRows(parseRoleImportCsv(source))); }} /><small>{fileName || "Required columns: Role name and Description of responsibilities. Colour is optional."}</small></label>{rows.length ? <div className="role-import-preview"><header><strong>{valid.length} ready</strong><span>{valid.length - existingCount} new · {existingCount} updates · {rows.length - valid.length} invalid</span></header>{rows.slice(0, 12).map((row) => <div className={row.error ? "invalid" : ""} key={`${row.row}-${row.name}`}><span>{row.row}</span><strong>{row.name || "Missing role name"}</strong><small>{row.error || (roleTemplates.some((role) => (role.normalizedName || normalizeRoleName(role.name)) === normalizeRoleName(row.name)) ? "Update existing" : "Create")}</small></div>)}</div> : null}</div><footer><button className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={!valid.length} onClick={() => void onImport(rows)}>Import {valid.length || ""} role{valid.length === 1 ? "" : "s"}</button></footer></section></div>;
}

function SettingsView({ data, onSave, onManageRoster }: { data: EventState; onSave: (prepEnabled: boolean, judgingEnabled: boolean) => void; onManageRoster: () => void }) {
  const [prepEnabled, setPrepEnabled] = useState(data.prepEnabled);
  const [judgingEnabled, setJudgingEnabled] = useState(data.judgingEnabled);
  const dirty = prepEnabled !== data.prepEnabled || judgingEnabled !== data.judgingEnabled;
  return <div className="content settings-view"><div className="section-title compact"><div><span className="kicker">Workspace settings</span><h2>Settings and modules</h2><p>Manage the organization-wide exec roster and choose which event tools appear in the left panel.</p></div>{dirty ? <button className="button primary" onClick={() => onSave(prepEnabled, judgingEnabled)}>Save settings</button> : null}</div><div className="settings-grid"><section className="settings-panel roster-settings"><header><span aria-hidden="true">◎</span><div><h3>Universal event roster</h3><p>One exec roster and team structure shared across every event.</p></div></header><div className="settings-stat"><strong>{data.people.length}</strong><span>execs</span><strong>{data.groups.length}</strong><span>teams</span></div><button className="button primary" onClick={onManageRoster}>Manage universal roster</button></section></div><section className="settings-modules"><div className="subhead"><div><span className="kicker">Event modules</span><h3>Left-panel tools</h3><p>Enabled modules appear alongside Schedule, People, Roles, and Event overview.</p></div></div><div className="module-card-grid"><article className={`module-card ${prepEnabled ? "enabled" : ""}`}><div className="module-icon">✓</div><div><span>Planning module</span><h3>Prep</h3><p>Sessions, tasks, owners, and prep availability.</p></div><label className="module-switch"><input type="checkbox" checked={prepEnabled} onChange={(event) => setPrepEnabled(event.target.checked)} /><span>{prepEnabled ? "Shown in left panel" : "Hidden from left panel"}</span></label></article><article className={`module-card ${judgingEnabled ? "enabled" : ""}`}><div className="module-icon">#</div><div><span>Competition module</span><h3>Judging rooms</h3><p>Live room status, teams, judges, and staff.</p></div><label className="module-switch"><input type="checkbox" checked={judgingEnabled} onChange={(event) => setJudgingEnabled(event.target.checked)} /><span>{judgingEnabled ? "Shown in left panel" : "Hidden from left panel"}</span></label></article></div></section></div>;
}

function BlockEditor({ day, blockId, onClose, onSave }: { day: EventDay; blockId?: string; onClose: () => void; onSave: (block: EventBlock) => void }) {
  const existing = day.blocks.find((block) => block.id === blockId);
  const [id] = useState(() => existing?.id ?? `${day.id}-block-${Date.now()}`);
  const [label, setLabel] = useState(existing?.label ?? "");
  const [start, setStart] = useState(existing?.start ?? "9:00");
  const [end, setEnd] = useState(existing?.end ?? "10:00");
  const [location, setLocation] = useState(existing?.location ?? "");
  const [color, setColor] = useState(existing?.color ?? "#d8d2ef");
  const [links, setLinks] = useState<BlockLink[]>(() => structuredClone(existing?.links ?? []));
  const updateLink = (linkId: string, patch: Partial<BlockLink>) => setLinks((current) => current.map((link) => link.id === linkId ? { ...link, ...patch } : link));
  return <div className="drawer-backdrop centered" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="setup-dialog block-dialog" role="dialog" aria-modal="true" aria-label={`${existing ? "Edit" : "Add"} schedule block`}><header><div><span className="kicker">{day.label} · {existing ? "Edit block" : "New block"}</span><h2>{existing ? existing.label : "Shape this part of the day."}</h2><p>Set the time and place here. Add roles directly from the schedule after saving.</p></div><button onClick={onClose} aria-label="Close">×</button></header><div className="block-form"><section><h3>Block details</h3><label>Block name<input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. Registration" autoFocus /></label><div className="form-row"><label>Start<input value={start} onChange={(event) => setStart(event.target.value)} /></label><label>End<input value={end} onChange={(event) => setEnd(event.target.value)} /></label></div><label>Location<input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Room or area" /></label><label>Block colour<input className="color-input" type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label></section><section><div className="form-section-head"><div><h3>Important links</h3><p>Add the exact documents this block needs.</p></div><button type="button" onClick={() => setLinks((current) => [...current, { id: `${id}-link-${Date.now()}`, label: "", url: "" }])}>+ Add link</button></div><div className="link-builder">{links.map((link, index) => <div key={link.id}><span>{String(index + 1).padStart(2, "0")}</span><input value={link.label} onChange={(event) => updateLink(link.id, { label: event.target.value })} placeholder="Link label" /><input value={link.url} onChange={(event) => updateLink(link.id, { url: event.target.value })} placeholder="https://…" /><button type="button" onClick={() => setLinks((current) => current.filter((item) => item.id !== link.id))} aria-label={`Remove link ${link.label || index + 1}`}>×</button></div>)}</div></section></div><footer><button className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={!label.trim()} onClick={() => onSave({ id, label: label.trim(), short: label.slice(0, 3).toUpperCase(), start, end, location: location.trim() || "Location TBD", color, requiredRoles: existing?.requiredRoles ?? [], roles: existing ? blockRoles(existing) : [], links: links.filter((link) => link.label.trim() && link.url.trim()) })}>{existing ? "Save block" : "Add block"}</button></footer></section></div>;
}

function RoleEditor({ data, day, editor, roleTemplates, onClose, onSave, onRemove, onReplaceMaster, onPromote }: { data: EventState; day: EventDay; editor: { blockId: string; blockRoleId: string }; roleTemplates: RoleTemplate[]; onClose: () => void; onSave: (values: { name: string; description: string; leadPersonId: string; color: string; scope: "block" | "event"; resetToLibrary?: boolean }) => void; onRemove: () => void; onReplaceMaster: () => void; onPromote: () => void }) {
  const block = day.blocks.find((item) => item.id === editor.blockId)!;
  const role = blockRoles(block).find((item) => item.id === editor.blockRoleId)!;
  const source = roleTemplates.find((template) => template.id === role.templateId);
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description);
  const [leadPersonId, setLeadPersonId] = useState(role.leadPersonId ?? "");
  const [color, setColor] = useState(blockRoleColor(role));
  const [scope, setScope] = useState<"block" | "event">("block");
  const [resetToLibrary, setResetToLibrary] = useState(false);
  const saveEditor = () => {
    if (name.trim()) onSave({ name: name.trim(), description: description.trim(), leadPersonId, color, scope, resetToLibrary });
  };
  return <div className="drawer-backdrop transparent" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="role-editor-popover" role="dialog" aria-modal="true" aria-label={`Edit ${role.name}`} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onClose(); } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); saveEditor(); } }}>
      <header><div><span className="kicker">{block.label} · Shared role</span><h2>Edit {role.name}</h2><p>Changes apply to everyone assigned to this role in the selected scope.</p></div><button onClick={onClose} aria-label="Close">×</button></header>
      <div className="role-editor-body">
        <div className="scope-switch" aria-label="Edit scope"><button className={scope === "block" ? "active" : ""} onClick={() => setScope("block")}>This block</button>{role.templateId ? <button className={scope === "event" ? "active" : ""} onClick={() => setScope("event")}>Whole event</button> : null}</div>
        <p className="scope-note">{scope === "block" ? `Updates all ${day.assignments.filter((assignment) => assignment.blockRoleId === role.id).length} people assigned to this role in ${block.label}.` : "Updates every event role linked to this master template; other events remain unchanged."}</p>
        {source ? <div className="role-source-note"><span>{role.customized || resetToLibrary ? "Customized from" : "Linked to"} <strong>{source.name}</strong> · copied revision {role.templateRevision || 1}{(role.templateRevision || 1) !== (source.revision || 1) ? ` · master revision ${source.revision || 1} available` : ""}</span>{role.customized || (role.templateRevision || 1) !== (source.revision || 1) ? <button type="button" onClick={() => { setName(source.name); setDescription(source.description); setColor(source.color || roleColor(source.name)); setResetToLibrary(true); }}>Restore library defaults</button> : null}</div> : <div className="role-source-note"><span>Event-only role · not in the master library</span></div>}
        <label>Role name<input value={name} onChange={(event) => { setName(event.target.value); setResetToLibrary(false); }} autoFocus /></label>
        <label>Role color<div className="role-color-field"><input className="color-input" type="color" value={color} onChange={(event) => { setColor(event.target.value); setResetToLibrary(false); }} /><span style={{ background: color }}>{name || "Role preview"}</span></div></label>
        <label>Role lead<select value={leadPersonId} onChange={(event) => setLeadPersonId(event.target.value)}><option value="">No role lead</option>{data.people.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Responsibilities and event details<textarea rows={5} value={description} onChange={(event) => { setDescription(event.target.value); setResetToLibrary(false); }} /></label>
      </div>
      <footer><button className="button danger" onClick={onRemove}>Remove from block</button>{source ? <button className="button secondary" onClick={onReplaceMaster}>Replace master</button> : <button className="button secondary" onClick={onPromote}>Add to library</button>}<span /><button className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={!name.trim()} onClick={saveEditor}>{scope === "event" ? "Save across event" : "Save this block"}</button></footer>
    </section>
  </div>;
}

function PublishedExecView({ data, person, dayId, setDayId, onPersonChange, onExit }: { data: EventState; person: Person; dayId: string; setDayId: (id: string) => void; onPersonChange: (personId: string) => void; onExit: () => void }) {
  const [view, setView] = useState<"day" | "schedule" | "overview">("day");
  const [now, setNow] = useState(() => new Date());
  const [visiblePersonTooltip, setVisiblePersonTooltip] = useState<string | null>(null);
  const day = data.days.find((item) => item.id === dayId) ?? data.days[0];
  const assignments = day ? sortAssignmentsByTime(day.assignments.filter((assignment) => assignment.personId === person.id), day.blocks) : [];
  const mergedAssignments = day ? mergeConsecutiveAssignments(assignments, day.blocks) : [];
  const moment = day ? assignmentForMoment(assignments, day.blocks, now) : null;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone.replaceAll("_", " ");
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 18 ? "Good afternoon" : "Good evening";

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const changeDay = (id: string) => {
    window.localStorage.setItem(execDayStorageKey(data.eventId), id);
    setDayId(id);
  };
  const peopleFor = (assignment: Assignment) => Array.from(new Set(day?.assignments
    .filter((candidate) => candidate.personId !== person.id && candidate.blockId === assignment.blockId && candidate.blockRoleId === assignment.blockRoleId)
    .map((candidate) => candidate.personId) ?? []))
    .map((personId) => data.people.find((member) => member.id === personId))
    .filter((member): member is Person => Boolean(member));
  const avatarRow = (members: Person[], rowId: string) => <div className="exec-avatar-row" aria-label={`With ${members.map((member) => member.name).join(", ")}`}>{members.slice(0, 5).map((member) => {
    const tooltipKey = `${rowId}:${member.id}`;
    return <span className="exec-person-icon" aria-label={member.name} tabIndex={0} key={member.id} onPointerEnter={() => setVisiblePersonTooltip(tooltipKey)} onPointerLeave={(event) => { if (event.pointerType === "mouse") setVisiblePersonTooltip((current) => current === tooltipKey ? null : current); }} onFocus={() => setVisiblePersonTooltip(tooltipKey)} onBlur={() => setVisiblePersonTooltip((current) => current === tooltipKey ? null : current)} onClick={(event) => { event.preventDefault(); event.stopPropagation(); event.currentTarget.focus(); setVisiblePersonTooltip(tooltipKey); }}><PersonAvatar person={member} />{visiblePersonTooltip === tooltipKey ? <span className="exec-person-tooltip" role="tooltip">{member.name}</span> : null}</span>;
  })}{members.length > 5 ? <small>+{members.length - 5}</small> : null}</div>;

  const myDay = <>
    <section className="exec-welcome"><div><span className="kicker">{greeting}, {person.name}</span><h1>My day</h1><p>{day?.date} · {data.venue} · Times in {timeZone}</p></div><DayToggle data={data} dayId={dayId} setDayId={changeDay} /></section>
    {moment && day ? (() => {
      const assignment = moment.assignment;
      const block = day.blocks.find((item) => item.id === assignment.blockId)!;
      const members = peopleFor(assignment);
      const interval = assignmentInterval(assignment, block);
      return <section className={`next-card ${moment.state}`} aria-label={`${moment.state === "current" ? "Current" : "Next"} role`}>
        <div className="next-time"><span>{moment.state === "current" ? "Now" : "Next up"}</span><strong>{formatEventTime(interval.start)}</strong><small>{formatEventTime(interval.end)}</small></div>
        <div className="next-main"><span className="next-block-label">{block.label}</span><h2>{assignment.role}</h2><p className="next-place">⌖ {block.location}{assignment.lead ? <><span>·</span>Lead: {assignment.lead}</> : null}</p><p>{assignment.description || "Check in with the event lead before this block begins."}</p>{members.length ? <div className="next-people"><span>With</span>{avatarRow(members, `current-${assignment.id}`)}</div> : null}</div>
      </section>;
    })() : <section className="exec-clear-card"><span>✓</span><div><strong>You’re all clear</strong><p>There are no remaining assigned roles for this day.</p></div></section>}
    <section className="my-day"><div className="subhead"><div><span className="kicker">Itinerary</span><h3>{mergedAssignments.length} role{mergedAssignments.length === 1 ? "" : "s"} on {day?.label}</h3></div></div><div className="itinerary exec-itinerary">{mergedAssignments.map((merged) => {
      const assignment = merged.assignment;
      const block = day!.blocks.find((item) => item.id === assignment.blockId)!;
      const members = peopleFor(assignment);
      const current = merged.assignments.some((item) => item.id === moment?.assignment.id) && moment?.state === "current";
      return <details key={merged.assignments.map((item) => item.id).join(":")} className={current ? "current" : ""}><summary><div className="itinerary-time"><strong>{formatEventTime(merged.start)}</strong><span>{formatEventTime(merged.end)}</span></div><i style={{ background: assignment.color || roleColor(assignment.role) }} /><div className="itinerary-role"><span>{block.label}</span><h4>{assignment.role}</h4><p>⌖ {block.location}</p></div>{members.length ? avatarRow(members, assignment.id) : <span /> }<b aria-hidden="true">＋</b></summary><div className="itinerary-details"><p>{assignment.description || "No additional instructions for this role."}</p>{assignment.lead ? <small>Role lead: {assignment.lead}</small> : null}</div></details>;
    })}{!mergedAssignments.length ? <p className="empty-copy">No roles are assigned to {person.name} on {day?.label}.</p> : null}</div></section>
  </>;

  const schedule = <section className="exec-full-schedule"><span className="kicker">Published schedule</span><h1>Event schedule</h1><p>The complete run of event blocks for {data.eventName}.</p>{data.days.map((scheduleDay) => <section className="exec-schedule-day" key={scheduleDay.id}><header><span>{scheduleDay.label}</span><h2>{scheduleDay.date}</h2></header>{[...scheduleDay.blocks].sort((first, second) => eventTimeToMinutes(first.start) - eventTimeToMinutes(second.start)).map((block) => {
    return <article key={block.id}><div className="full-schedule-time" style={{ background: block.color }}><strong>{block.start}</strong><span>{block.end}</span></div><div className="full-schedule-main"><span>⌖ {block.location}</span><h3>{block.label}</h3></div></article>;
  })}</section>)}</section>;

  const dayOf = data.resources.filter((resource) => resource.dayOf);
  const library = data.resources.filter((resource) => !resource.dayOf);
  const resourceRows = (resources: Resource[]) => <div className="overview-group">{resources.map((resource) => resource.url ? <a key={resource.id} href={resource.url} target="_blank" rel="noreferrer"><span>{resource.label}</span><b>↗</b></a> : <div className="resource-placeholder" key={resource.id}><span>{resource.label}</span><b>Link pending</b></div>)}{!resources.length ? <p className="empty-copy">Nothing has been added yet.</p> : null}</div>;
  const overview = <section className="exec-overview"><span className="kicker">Shared reference</span><h1>Event overview</h1><p>Day-of essentials and the complete resource library for {data.eventName}.</p><div className="overview-grid"><section className="overview-panel"><header><span>↗</span><div><h3>Day-of essentials</h3><p>{dayOf.filter((resource) => resource.url).length} ready links</p></div></header>{resourceRows(dayOf)}</section><section className="overview-panel"><header><span>☎</span><div><h3>Important people</h3><p>{data.contacts.length} contacts</p></div></header><div className="contact-list">{data.contacts.map((contact) => <a href={`tel:${contact.phone}`} key={contact.id}><div><strong>{contact.name}</strong><span>{contact.role}</span></div><b>{contact.phone}</b></a>)}{!data.contacts.length ? <p className="empty-copy">No contacts added yet.</p> : null}</div></section></div><section className="overview-panel event-library-panel"><header><span>≡</span><div><h3>Complete event library</h3><p>{library.length} planning and reference links</p></div></header>{resourceRows(library)}</section></section>;

  return <div className="exec-app"><header className="exec-header"><div className="exec-brand"><span>R</span> relay</div><div><label className="exec-profile exec-profile-picker"><PersonAvatar person={person} /><select aria-label="Viewing published roles for" value={person.id} onChange={(event) => onPersonChange(event.target.value)}>{data.people.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></label><button className="exit-preview" onClick={onExit}>Back to portal</button></div></header><main>{view === "day" ? myDay : view === "schedule" ? schedule : overview}</main><nav className="exec-nav" aria-label="Exec view"><button className={view === "day" ? "active" : ""} onClick={() => setView("day")}><span>◷</span>My day</button><button className={view === "schedule" ? "active" : ""} onClick={() => setView("schedule")}><span>▤</span>Schedule</button><button className={view === "overview" ? "active" : ""} onClick={() => setView("overview")}><span>↗</span>Overview</button></nav></div>;
}
