"use client";

import { useEffect, useMemo, useState } from "react";
import { parseScheduleTable } from "./schedule-import";

type AvailabilityStatus = "available" | "conditional" | "unavailable";
type Section = "schedule" | "people" | "roles" | "judging" | "resources";
type ExecSection = "today" | "schedule" | "availability" | "overview" | "directory";

type BlockLink = { id: string; label: string; url: string };
type BlockRole = {
  id: string;
  name: string;
  description: string;
  leadPersonId: string;
  target: number;
  intensity: "Low" | "Medium" | "High";
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
};

type ExecGroup = { id: string; name: string; color: string };
type ImportantContact = { id: string; name: string; role: string; phone: string };

type EventBlock = {
  id: string;
  label: string;
  short: string;
  start: string;
  end: string;
  location: string;
  color: string;
  target: number;
  requiredRoles: string[];
  roles?: BlockRole[];
  links?: BlockLink[];
};

type Assignment = {
  id: string;
  personId: string;
  blockId: string;
  role: string;
  lead: string;
  leadPersonId?: string;
  description: string;
  intensity: "Low" | "Medium" | "High";
  color: string;
};

type EventDay = {
  id: string;
  label: string;
  date: string;
  blocks: EventBlock[];
  assignments: Assignment[];
};

type Resource = { id: string; label: string; group: string; url: string };
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
  people: Person[];
  days: EventDay[];
  resources: Resource[];
  groups: ExecGroup[];
  contacts: ImportantContact[];
  judgingRooms: JudgingRoom[];
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
  { id: "d1-setup", label: "Set-up", short: "SET", start: "7:30", end: "9:15", location: "HA 098", color: "#f3c8cf", target: 5, requiredRoles: ["Materials", "Room Scout"] },
  { id: "d1-checkin", label: "Check-in", short: "IN", start: "9:15", end: "10:00", location: "HA 098", color: "#d8d2ef", target: 5, requiredRoles: ["Participant Care", "Registration"] },
  { id: "d1-kickoff", label: "Kickoff", short: "GO", start: "10:00", end: "11:30", location: "HA 098", color: "#c5dfd7", target: 5, requiredRoles: ["Hype", "AV", "Media"] },
  { id: "d1-lunch", label: "Lunch", short: "LUN", start: "11:30", end: "12:30", location: "HA 291", color: "#f7e0a7", target: 6, requiredRoles: ["Food Team", "Usher"] },
  { id: "d1-build", label: "Hacking", short: "BLD", start: "12:30", end: "4:30", location: "Hacking rooms", color: "#f3d9bc", target: 7, requiredRoles: ["On Call", "Dev Support", "Discord Mod"] },
  { id: "d1-dinner", label: "Dinner + game", short: "DIN", start: "4:30", end: "6:30", location: "HA 291 / 492", color: "#f0c6b9", target: 6, requiredRoles: ["Food Team", "Game Mod"] },
  { id: "d1-close", label: "Close", short: "END", start: "6:30", end: "9:00", location: "All rooms", color: "#d8e8d2", target: 8, requiredRoles: ["On Call", "Sweep"] },
];

const day2Blocks: EventBlock[] = [
  { id: "d2-setup", label: "Set-up", short: "SET", start: "7:30", end: "9:00", location: "HA 291", color: "#f3c8cf", target: 5, requiredRoles: ["Materials", "Room Scout"] },
  { id: "d2-checkin", label: "Breakfast", short: "IN", start: "9:00", end: "10:00", location: "HA 291", color: "#d8d2ef", target: 5, requiredRoles: ["Participant Care", "Food Team"] },
  { id: "d2-hacking", label: "Hacking", short: "BLD", start: "10:00", end: "12:30", location: "Hacking rooms", color: "#f3d9bc", target: 7, requiredRoles: ["On Call", "Dev Support"] },
  { id: "d2-lunch", label: "Lunch", short: "LUN", start: "12:30", end: "1:30", location: "Birmingham", color: "#c8e1ef", target: 6, requiredRoles: ["Food Team", "Judge Usher"] },
  { id: "d2-judging", label: "Round 1 judging", short: "JDG", start: "1:30", end: "3:00", location: "HA 241–296", color: "#cfe2c8", target: 9, requiredRoles: ["Timekeeper", "Usher Hackers", "Dev Support"] },
  { id: "d2-finals", label: "Finals", short: "FIN", start: "3:00", end: "5:00", location: "HA 492", color: "#f3d1cb", target: 7, requiredRoles: ["Timekeeper", "Vibe Check", "Media"] },
  { id: "d2-close", label: "Closing + clean-up", short: "END", start: "5:00", end: "6:00", location: "HA 492", color: "#d1e4e7", target: 9, requiredRoles: ["Hype", "Sweep"] },
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
    role,
    lead: role === "Food Team" ? "Hiro" : role === "Dev Support" ? "Benny" : role === "Timekeeper" ? "Grace" : "Event Directors",
    description: roleDescriptions[role] ?? `Follow the ${day} run-of-show and check in with the event directors before this block begins.`,
    intensity: ["Materials", "Food Team", "Usher Hackers", "Sweep"].includes(role) ? "High" : ["On Call", "Media"].includes(role) ? "Low" : "Medium",
    color: roleColor(role),
  }));
}

function roleColor(role: string) {
  if (["Media", "AV", "Dev Support", "Discord Mod"].includes(role)) return "#70a4f4";
  if (["Food Team", "Materials", "Room Scout"].includes(role)) return "#f3b667";
  if (["Timekeeper", "Usher Hackers", "Judge Usher"].includes(role)) return "#b1a0dd";
  if (["Hype", "MC", "Game Mod"].includes(role)) return "#dff05f";
  if (["Sweep", "On Call"].includes(role)) return "#c8d8c2";
  return "#f2c2b4";
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
  people: peopleBase.map(([id, name, initials, team, color, preferences]) => ({
    id, name, initials, team, color, preferences: [...preferences],
    phone: id === "pauline" ? "604-555-0182" : id === "benny" ? "604-555-0148" : "",
    email: `${id}@ubcbiztech.com`,
    groupIds: [team.toLowerCase().replace(/[^a-z0-9]+/g, "-")],
    privateNote: id === "angela" ? "Strong participant instincts. Avoid back-to-back physical roles after lunch." : id === "benny" ? "Best first responder for judging platform issues." : "No event-specific notes yet.",
    availability: defaultAvailability(id),
  })),
  days: [
    { id: "day1", label: "Day 1", date: "Saturday, March 21", blocks: day1Blocks, assignments: makeAssignments(day1Plan, "Day 1") },
    { id: "day2", label: "Day 2", date: "Sunday, March 22", blocks: day2Blocks, assignments: makeAssignments(day2Plan, "Day 2") },
  ],
  resources: [
    { id: "r1", label: "Event master plan", group: "Operations", url: "#" },
    { id: "r2", label: "Floorplan + room map", group: "Operations", url: "#" },
    { id: "r3", label: "Opening and closing script", group: "Program", url: "#" },
    { id: "r4", label: "Judge briefing", group: "Judging", url: "#" },
    { id: "r5", label: "Participant feedback form", group: "Feedback", url: "#" },
    { id: "r6", label: "Emergency contacts", group: "Contacts", url: "#" },
  ],
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
  return block.requiredRoles.map((name, index) => ({
    id: `${block.id}-role-${index}`,
    name,
    description: roleDescriptions[name] ?? `Support ${block.label} and check in with the block lead before ${block.start}.`,
    leadPersonId: "",
    target: 1,
    intensity: ["Materials", "Food Team", "Usher Hackers", "Sweep"].includes(name) ? "High" : "Medium",
  }));
}

function timeToMinutes(value: string) {
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([AP]M)?/i);
  if (!match) return Number.MAX_SAFE_INTEGER;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === "AM" && hour === 12) hour = 0;
  if (meridiem === "PM" && hour !== 12) hour += 12;
  if (!meridiem && hour >= 1 && hour <= 6) hour += 12;
  return hour * 60 + minute;
}

function sortBlocks(blocks: EventBlock[]) {
  return [...blocks].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start) || timeToMinutes(a.end) - timeToMinutes(b.end) || a.label.localeCompare(b.label));
}

function normalizeEvent(raw: EventState): EventState {
  const eventId = raw.eventId || "productx-2026";
  const legacyGroups = Array.from(new Set((raw.people ?? []).map((person) => person.team).filter(Boolean))).map((name, index) => ({
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name, color: ["#dfef79", "#7f99ff", "#b9a7ff", "#f8bb65", "#92c9ff"][index % 5],
  }));
  const groups = raw.groups?.length ? raw.groups : legacyGroups;
  return {
    ...raw,
    eventId,
    groups,
    contacts: raw.contacts ?? [],
    resources: raw.resources ?? [],
    people: raw.people.map((person) => ({
      ...person,
      phone: person.phone ?? "",
      email: person.email ?? "",
      groupIds: person.groupIds?.length ? person.groupIds : groups.filter((group) => group.name === person.team).map((group) => group.id),
      availability: Object.fromEntries(raw.days.map((day) => [
        day.id,
        Object.fromEntries(day.blocks.map((block) => [block.id, person.availability?.[day.id]?.[block.id] ?? "available"])),
      ])),
    })),
    days: raw.days.map((day) => ({
      ...day,
      blocks: sortBlocks(day.blocks.map((block) => ({ ...block, roles: blockRoles(block), links: block.links ?? [] }))),
    })),
  };
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
    people: people.map((person) => ({ ...person, availability: Object.fromEntries(days.map((day) => [day.id, {}])) })),
    days,
    resources: [],
    groups: structuredClone((dataSafePeopleGroups(people))),
    contacts: [],
    judgingRooms: [],
  });
}

function dataSafePeopleGroups(people: Person[]): ExecGroup[] {
  const names = Array.from(new Set(people.map((person) => person.team).filter(Boolean)));
  return names.map((name, index) => ({ id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name, color: ["#dfef79", "#7f99ff", "#b9a7ff", "#f8bb65"][index % 4] }));
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
    target: 1,
    requiredRoles: [],
    roles: [],
    links: [],
  }));
}

function assignmentLeadName(assignment: Assignment, people: Person[]) {
  return people.find((person) => person.id === assignment.leadPersonId)?.name ?? assignment.lead ?? "Event Directors";
}

function candidateFit(person: Person, role: string, day: EventDay, block: EventBlock) {
  const status = person.availability[day.id]?.[block.id] ?? "available";
  const load = day.assignments.filter((assignment) => assignment.personId === person.id).length;
  const preferred = person.preferences.some((preference) => preference.toLowerCase() === role.toLowerCase());
  let score = status === "available" ? 50 : status === "conditional" ? 20 : -100;
  if (preferred) score += 35;
  score += Math.max(0, 15 - load * 3);
  const reasons = [status === "available" ? "Available for the full block" : status === "conditional" ? "Conditionally available" : "Marked unavailable"];
  if (preferred) reasons.push(`Prefers ${role}`);
  if (load <= 2) reasons.push("Light schedule today");
  else reasons.push(`${load} assignments today`);
  return { score, status, load, preferred, reason: reasons.join(" · ") };
}

function PersonAvatar({ person, small = false }: { person: Person; small?: boolean }) {
  return <span className={`avatar ${small ? "avatar-small" : ""}`} style={{ background: person.color }}>{person.initials}</span>;
}

export function RelayWorkspace() {
  const [data, setData] = useState<EventState>(() => normalizeEvent(seedData));
  const [eventLibrary, setEventLibrary] = useState<EventState[]>(() => [normalizeEvent(seedData)]);
  const [hydrated, setHydrated] = useState(false);
  const [mode, setMode] = useState<"director" | "exec">("director");
  const [section, setSection] = useState<Section>("schedule");
  const [execSection, setExecSection] = useState<ExecSection>("today");
  const [dayId, setDayId] = useState("day2");
  const [drawer, setDrawer] = useState<{ blockId: string; personId: string; assignmentId?: string } | null>(null);
  const [blockEditor, setBlockEditor] = useState<{ blockId?: string } | null>(null);
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [showEventLibrary, setShowEventLibrary] = useState(false);
  const [showScheduleImport, setShowScheduleImport] = useState(false);
  const [showRoster, setShowRoster] = useState(false);
  const [toast, setToast] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/event-state")
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((payload) => {
        const states = (payload.states ?? (payload.state ? [payload.state] : [])).map((state: EventState) => normalizeEvent(state));
        if (states.length) {
          setEventLibrary(states);
          setData(states[0]);
          setDayId(states[0].days[0].id);
        }
      })
      .catch(() => undefined)
      .finally(() => setHydrated(true));
  }, []);

  const save = async (next: EventState, message: string) => {
    setData(next);
    setEventLibrary((current) => current.some((event) => event.eventId === next.eventId) ? current.map((event) => event.eventId === next.eventId ? next : event) : [next, ...current]);
    setSaving(true);
    setToast(message);
    try {
      await fetch("/api/event-state", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(next) });
    } finally {
      setSaving(false);
      window.setTimeout(() => setToast(""), 2400);
    }
  };

  const activeDay = data.days.find((day) => day.id === dayId) ?? data.days[0];
  const currentExec = data.people.find((person) => person.id === "angela") ?? data.people[0];
  const activeAssignments = activeDay.assignments;

  const warnings = useMemo(() => {
    const items: { level: string; title: string; detail: string }[] = [];
    for (const day of data.days) {
      for (const assignment of day.assignments) {
        const person = data.people.find((item) => item.id === assignment.personId);
        const block = day.blocks.find((item) => item.id === assignment.blockId);
        if (person && block && person.availability[day.id]?.[block.id] === "unavailable") {
          items.push({ level: "Conflict", title: `${person.name} is unavailable`, detail: `${day.label} · ${block.label} · ${assignment.role}` });
        }
      }
      for (const block of day.blocks) {
        for (const role of blockRoles(block)) {
          const assigned = day.assignments.filter((assignment) => assignment.blockId === block.id && assignment.role === role.name);
          if (assigned.length < role.target) {
            items.push({ level: "Coverage", title: `${role.name} needs ${role.target - assigned.length} more`, detail: `${day.label} · ${block.label} · ${assigned.length} of ${role.target} assigned` });
          }
          if (!role.leadPersonId && !assigned.some((assignment) => assignment.leadPersonId)) {
            items.push({ level: "Lead", title: `${role.name} has no lead`, detail: `${day.label} · ${block.label}` });
          }
        }
      }
    }
    for (const person of data.people) {
      const assignments = data.days.flatMap((day) => day.assignments.filter((assignment) => assignment.personId === person.id));
      const highIntensity = assignments.filter((assignment) => assignment.intensity === "High").length;
      if (assignments.length >= 6 || highIntensity >= 3) {
        items.push({ level: "Workload", title: `${person.name} has a heavy workload`, detail: `${assignments.length} blocks · ${highIntensity} high-intensity` });
      }
    }
    return items;
  }, [data]);

  const roleRequirements = activeDay.blocks.flatMap((block) => blockRoles(block).map((role) => ({ blockId: block.id, role })));
  const required = roleRequirements.reduce((total, item) => total + item.role.target, 0);
  const covered = roleRequirements.reduce((total, item) => total + Math.min(item.role.target, activeAssignments.filter((assignment) => assignment.blockId === item.blockId && assignment.role === item.role.name).length), 0);

  const publish = () => {
    const next = { ...data, draftChanges: 0, publishedAt: "Just now" };
    void save(next, "Published. Everyone’s view is up to date.");
  };

  const saveAssignment = (values: { personIds: string[]; role: string; lead: string; leadPersonId: string; description: string; intensity: Assignment["intensity"] }) => {
    if (!drawer) return;
    const next = structuredClone(data);
    const day = next.days.find((item) => item.id === dayId)!;
    if (drawer.assignmentId) {
      const assignment = day.assignments.find((item) => item.id === drawer.assignmentId)!;
      Object.assign(assignment, { personId: values.personIds[0], role: values.role, lead: values.lead, leadPersonId: values.leadPersonId, description: values.description, intensity: values.intensity, color: roleColor(values.role) });
    } else {
      for (const personId of values.personIds) {
        if (day.assignments.some((assignment) => assignment.blockId === drawer.blockId && assignment.personId === personId && assignment.role === values.role)) continue;
        day.assignments.push({ id: `${drawer.blockId}-${personId}-${Date.now()}`, blockId: drawer.blockId, personId, color: roleColor(values.role), role: values.role, lead: values.lead, leadPersonId: values.leadPersonId, description: values.description, intensity: values.intensity });
      }
    }
    next.draftChanges += 1;
    setDrawer(null);
    void save(next, "Assignment saved to the shared event.");
  };

  const updateAvailability = (personId: string, availabilityDayId: string, blockId: string) => {
    const next = structuredClone(data);
    const person = next.people.find((item) => item.id === personId)!;
    person.availability[availabilityDayId] ??= {};
    const current = person.availability[availabilityDayId][blockId] ?? "available";
    person.availability[availabilityDayId][blockId] = current === "available" ? "conditional" : current === "conditional" ? "unavailable" : "available";
    next.draftChanges += 1;
    void save(next, "Availability updated.");
  };

  const saveBlock = (block: EventBlock) => {
    const next = structuredClone(data);
    const day = next.days.find((item) => item.id === dayId)!;
    const existingIndex = day.blocks.findIndex((item) => item.id === block.id);
    if (existingIndex >= 0) day.blocks[existingIndex] = block;
    else day.blocks.push(block);
    day.blocks = sortBlocks(day.blocks);
    for (const person of next.people) {
      person.availability[day.id] ??= {};
      person.availability[day.id][block.id] ??= "available";
    }
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
    for (const person of next.people) {
      person.availability[day.id] ??= {};
      person.availability[day.id][duplicateId] = person.availability[day.id]?.[source.id] ?? "available";
    }
    next.draftChanges += 1;
    void save(next, `${source.label} duplicated with its roles and instructions.`);
  };

  const deleteBlock = (blockId: string) => {
    const block = activeDay.blocks.find((item) => item.id === blockId);
    if (!block || !window.confirm(`Delete “${block.label}”? Its assignments and availability responses for this block will also be removed.`)) return;
    const next = structuredClone(data);
    const day = next.days.find((item) => item.id === dayId)!;
    day.blocks = day.blocks.filter((item) => item.id !== blockId);
    day.assignments = day.assignments.filter((assignment) => assignment.blockId !== blockId);
    for (const person of next.people) delete person.availability[day.id]?.[blockId];
    next.draftChanges += 1;
    void save(next, `${block.label} deleted from the schedule.`);
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
    for (const person of next.people) {
      person.availability[day.id] = Object.fromEntries(day.blocks.map((block) => [block.id, person.availability[day.id]?.[block.id] ?? "available"]));
    }
    next.draftChanges += 1;
    setShowScheduleImport(false);
    void save(next, `${blocks.length} schedule block${blocks.length === 1 ? "" : "s"} imported.`);
  };

  const saveRoster = (people: Person[], groups: ExecGroup[]) => {
    const next = structuredClone(data);
    next.groups = groups;
    next.people = people.map((person) => ({
      ...person,
      team: groups.find((group) => person.groupIds.includes(group.id))?.name ?? person.team ?? "Unassigned",
      availability: Object.fromEntries(next.days.map((day) => [day.id, Object.fromEntries(day.blocks.map((block) => [block.id, person.availability?.[day.id]?.[block.id] ?? "available"]))])),
    }));
    const validPeople = new Set(next.people.map((person) => person.id));
    for (const day of next.days) day.assignments = day.assignments.filter((assignment) => validPeople.has(assignment.personId));
    next.draftChanges += 1;
    setShowRoster(false);
    void save(next, "Event roster and groups updated.");
  };

  const saveOverview = (resources: Resource[], contacts: ImportantContact[]) => {
    const next = structuredClone(data);
    next.resources = resources;
    next.contacts = contacts;
    next.draftChanges += 1;
    void save(next, "Event overview updated for directors and execs.");
  };

  const startNewEvent = (values: { name: string; type: string; venue: string; startDate: string; dayCount: number }) => {
    const next = createBlankEvent(values, data.people);
    setShowNewEvent(false);
    setShowEventLibrary(false);
    setDayId(next.days[0].id);
    setSection("schedule");
    void save(next, "New event created. Add your first schedule block.");
  };

  const switchEvent = (event: EventState) => {
    setData(normalizeEvent(event));
    setDayId(event.days[0].id);
    setShowEventLibrary(false);
    setSection("schedule");
  };

  const cycleJudgingStatus = (roomId: string, slotIndex: number) => {
    const next = structuredClone(data);
    const slot = next.judgingRooms.find((room) => room.id === roomId)!.slots[slotIndex];
    const order: JudgingRoom["slots"][number]["status"][] = ["Waiting", "Presenting", "Done", "Dropped"];
    slot.status = order[(order.indexOf(slot.status) + 1) % order.length];
    next.draftChanges += 1;
    void save(next, `${slot.team} marked ${slot.status.toLowerCase()}.`);
  };

  return (
    <div className={`app-shell ${mode === "exec" ? "exec-shell" : ""}`}>
      {mode === "director" ? (
        <>
          <aside className="sidebar">
            <button className="brand" onClick={() => setSection("schedule")} aria-label="Relay home"><span>R</span> relay</button>
            <button className="event-mini" onClick={() => setShowEventLibrary(true)}><span className="event-mark">{data.eventName.slice(0, 2).toUpperCase()}</span><div><strong>{data.eventName}</strong><small>{data.dateRange}</small></div><span aria-hidden="true">⌄</span></button>
            <nav aria-label="Director workspace">
              {([[
                "schedule", "Schedule", "01"
              ], ["people", "People + availability", "02"], ["roles", "Roles + instructions", "03"], ["judging", "Judging rooms", "04"], ["resources", "Event overview", "05"]] as [Section, string, string][]).map(([id, label, number]) => (
                <button key={id} className={section === id ? "active" : ""} onClick={() => setSection(id)}><span>{number}</span>{label}{id === "schedule" && warnings.length > 0 ? <b>{warnings.length}</b> : null}</button>
              ))}
            </nav>
            <div className="sidebar-bottom"><button onClick={() => setMode("exec")}><span className="avatar avatar-small" style={{ background: currentExec.color }}>{currentExec.initials}</span><div><strong>Preview as exec</strong><small>{currentExec.name}</small></div><span>↗</span></button></div>
          </aside>
          <main className="workspace">
            <header className="workspace-header">
              <div><div className="eyebrow">{data.eventType} · {data.venue}</div><h1>{data.eventName}</h1><p>{data.dateRange} <span>•</span> Published {data.publishedAt}</p></div>
              <div className="header-actions"><span className={`save-state ${saving ? "saving" : ""}`}>{saving ? "Saving…" : hydrated ? "All changes saved" : "Connecting…"}</span><button className="button secondary" onClick={() => setShowNewEvent(true)}>+ New event</button><button className="button secondary" onClick={() => setMode("exec")}>Exec view</button><button className="button primary" onClick={publish} disabled={data.draftChanges === 0}>Publish {data.draftChanges ? `${data.draftChanges} changes` : "changes"}</button></div>
            </header>

            {section === "schedule" && <ScheduleView data={data} activeDay={activeDay} dayId={dayId} setDayId={setDayId} warnings={warnings} covered={covered} required={required} onCell={(blockId, personId, assignmentId) => setDrawer({ blockId, personId, assignmentId })} onAddBlock={() => setBlockEditor({})} onImport={() => setShowScheduleImport(true)} onEditBlock={(blockId) => setBlockEditor({ blockId })} onDuplicateBlock={duplicateBlock} onDeleteBlock={deleteBlock} />}
            {section === "people" && <PeopleView data={data} activeDay={activeDay} dayId={dayId} setDayId={setDayId} onAvailability={(personId, blockId) => updateAvailability(personId, activeDay.id, blockId)} onManageRoster={() => setShowRoster(true)} />}
            {section === "roles" && <RolesView data={data} activeDay={activeDay} dayId={dayId} setDayId={setDayId} onOpen={(assignment) => setDrawer({ blockId: assignment.blockId, personId: assignment.personId, assignmentId: assignment.id })} onEditBlock={(blockId) => setBlockEditor({ blockId })} onDuplicateBlock={duplicateBlock} />}
            {section === "judging" && <JudgingView data={data} onCycle={cycleJudgingStatus} />}
            {section === "resources" && <ResourcesView data={data} onSave={saveOverview} />}
          </main>
          {drawer && <AssignmentDrawer data={data} day={activeDay} drawer={drawer} onClose={() => setDrawer(null)} onSave={saveAssignment} />}
          {blockEditor && <BlockEditor data={data} day={activeDay} blockId={blockEditor.blockId} onClose={() => setBlockEditor(null)} onSave={saveBlock} />}
          {showNewEvent && <NewEventDialog onClose={() => setShowNewEvent(false)} onCreate={startNewEvent} />}
          {showEventLibrary && <EventLibraryDialog events={eventLibrary} currentId={data.eventId} onClose={() => setShowEventLibrary(false)} onSwitch={switchEvent} onNew={() => { setShowEventLibrary(false); setShowNewEvent(true); }} />}
          {showScheduleImport && <ScheduleImportDialog day={activeDay} onClose={() => setShowScheduleImport(false)} onImport={importSchedule} />}
          {showRoster && <RosterDialog data={data} onClose={() => setShowRoster(false)} onSave={saveRoster} />}
        </>
      ) : (
        <ExecView data={data} person={currentExec} dayId={dayId} setDayId={setDayId} section={execSection} setSection={setExecSection} onAvailability={updateAvailability} onExit={() => setMode("director")} />
      )}
      {toast ? <div className="toast" role="status"><span>✓</span>{toast}</div> : null}
    </div>
  );
}

function DayToggle({ data, dayId, setDayId }: { data: EventState; dayId: string; setDayId: (id: string) => void }) {
  return <div className="day-toggle" aria-label="Event day">{data.days.map((day) => <button key={day.id} className={dayId === day.id ? "active" : ""} onClick={() => setDayId(day.id)}>{day.label}<small>{day.date.replace(/^[A-Za-z]+, /, "")}</small></button>)}</div>;
}

function ScheduleView({ data, activeDay, dayId, setDayId, warnings, covered, required, onCell, onAddBlock, onImport, onEditBlock, onDuplicateBlock, onDeleteBlock }: { data: EventState; activeDay: EventDay; dayId: string; setDayId: (id: string) => void; warnings: { level: string; title: string; detail: string }[]; covered: number; required: number; onCell: (blockId: string, personId: string, assignmentId?: string) => void; onAddBlock: () => void; onImport: () => void; onEditBlock: (blockId: string) => void; onDuplicateBlock: (blockId: string) => void; onDeleteBlock: (blockId: string) => void }) {
  if (!activeDay.blocks.length) return <div className="content schedule-content"><div className="section-title"><div><span className="kicker">Schedule</span><h2>Add the event schedule</h2><p>Import a day from Google Docs or add blocks manually. Locations can be filled in later.</p></div><DayToggle data={data} dayId={dayId} setDayId={setDayId} /></div><section className="empty-builder"><span>01</span><h3>No blocks yet</h3><p>Paste a table or time-based schedule from the planning document.</p><div className="empty-actions"><button className="button primary" onClick={onImport}>Import from Google Docs</button><button className="button secondary" onClick={onAddBlock}>+ Add block</button></div></section></div>;
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
    <div className="section-title"><div><span className="kicker">Schedule</span><h2>{activeDay.label}</h2><p>Assign people, review coverage, or edit a block.</p></div><div className="schedule-actions"><DayToggle data={data} dayId={dayId} setDayId={setDayId} /><button className="button secondary" onClick={onImport}>Import Google Doc</button><button className="button secondary" onClick={onAddBlock}>+ Add block</button></div></div>
    <div className="stat-strip">
      <div><span>Role coverage</span><strong>{covered}/{required}</strong><small>core roles staffed</small></div>
      <div><span>People scheduled</span><strong>{new Set(activeDay.assignments.map((a) => a.personId)).size}/{data.people.length}</strong><small>available execs</small></div>
      <div><span>Needs attention</span><strong>{warnings.length}</strong><small>all overridable</small></div>
      <div className="publish-card"><span>Published plan</span><strong>{data.draftChanges ? `${data.draftChanges} edits ahead` : "Up to date"}</strong><small>Last publish {data.publishedAt}</small></div>
    </div>
    <section className="board-card">
      <div className="board-toolbar"><div><strong>{activeDay.date}</strong><span>{blocks[0].start} – {blocks.reduce((latest, block) => timeToMinutes(block.end) > timeToMinutes(latest) ? block.end : latest, blocks[0].end)}</span></div><div className="legend"><span><i className="legend-dot available" />Available</span><span><i className="legend-dot conditional" />Conditional</span><span><i className="legend-dot conflict" />Conflict</span></div></div>
      <div className="timeline-scroll">
        <div className="timeline" style={{ "--columns": blocks.length } as React.CSSProperties}>
          <div className="timeline-corner">Person</div>
          {timeframes.map((timeframe) => <div className="timeframe-head" key={`${timeframe.start}-${timeframe.end}`} style={{ gridColumn: `span ${timeframe.blocks.length}` }}><strong>{timeframe.start}–{timeframe.end}</strong><span>{timeframe.blocks.length > 1 ? `${timeframe.blocks.length} concurrent events` : "1 event"}</span></div>)}
          {blocks.map((block) => <div className="block-head-wrap" key={block.id} style={{ background: block.color }}><button className="block-head" onClick={() => onEditBlock(block.id)} aria-label={`Edit ${block.label}`}><strong>{block.label}</strong><span>{block.location || "Location not set"}</span></button><button className="duplicate-block" onClick={() => onDuplicateBlock(block.id)} aria-label={`Duplicate ${block.label}`} title="Duplicate block">⧉</button><button className="delete-block" onClick={() => onDeleteBlock(block.id)} aria-label={`Delete ${block.label}`} title="Delete block">×</button></div>)}
          {data.people.map((person) => <div className="timeline-row" key={person.id}>
            <div className="person-cell"><PersonAvatar person={person} small /><div><strong>{person.name}</strong><small>{activeDay.assignments.filter((a) => a.personId === person.id).length} roles</small></div></div>
            {blocks.map((block) => {
              const assignment = activeDay.assignments.find((item) => item.personId === person.id && item.blockId === block.id);
              const availability = person.availability[activeDay.id]?.[block.id] ?? "available";
              const roleAssignments = assignment ? activeDay.assignments.filter((item) => item.blockId === block.id && item.role === assignment.role) : [];
              const teammates = roleAssignments.filter((item) => item.personId !== person.id).map((item) => data.people.find((candidate) => candidate.id === item.personId)?.name).filter(Boolean);
              const lead = assignment ? assignmentLeadName(assignment, data.people) : "";
              return <button className={`assignment-cell ${availability}`} key={block.id} onClick={() => onCell(block.id, person.id, assignment?.id)} title={assignment ? `Lead: ${lead}${teammates.length ? ` · With ${teammates.join(", ")}` : ""}` : `Assign ${person.name} to ${block.label}`} aria-label={`${person.name}, ${block.label}${assignment ? `, ${assignment.role}, lead ${lead}${teammates.length ? `, with ${teammates.join(", ")}` : ""}` : ", add assignment"}`}>
                {assignment ? <span className="role-chip" style={{ background: assignment.color }}><span><b>{assignment.role}</b><small>Lead: {lead}{teammates.length ? ` · +${teammates.length}` : ""}</small></span><i>{assignment.intensity.slice(0, 1)}</i></span> : <span className="add-role">+</span>}
              </button>;
            })}
          </div>)}
        </div>
      </div>
    </section>
    <section className="attention-section"><div className="subhead"><div><span className="kicker">Human review</span><h3>What needs your judgment</h3></div><button className="text-button">View all checks →</button></div><div className="warning-grid">{warnings.slice(0, 3).map((warning, index) => <article key={`${warning.title}-${index}`}><span className={`warning-type w-${warning.level.toLowerCase()}`}>{warning.level}</span><h4>{warning.title}</h4><p>{warning.detail}</p><button>Review in schedule <span>→</span></button></article>)}</div></section>
  </div>;
}

function PeopleView({ data, activeDay, dayId, setDayId, onAvailability, onManageRoster }: { data: EventState; activeDay: EventDay; dayId: string; setDayId: (id: string) => void; onAvailability: (personId: string, blockId: string) => void; onManageRoster: () => void }) {
  return <div className="content"><div className="section-title compact"><div><span className="kicker">People</span><h2>Exec roster and availability</h2><p>Manage the event list and groups, then click a cell to update availability.</p></div><DayToggle data={data} dayId={dayId} setDayId={setDayId} /></div>
    <div className="people-summary"><div><strong>{data.people.length}</strong><span>execs on this event</span></div><div><strong>{data.groups.length}</strong><span>groups</span></div><button className="button primary" onClick={onManageRoster}>Manage roster + groups</button></div>
    <section className="availability-card"><div className="availability-scroll"><div className="availability-grid" style={{ "--columns": activeDay.blocks.length } as React.CSSProperties}><div className="availability-corner">Exec</div>{activeDay.blocks.map((block) => <div className="availability-head" key={block.id}><strong>{block.short}</strong><small>{block.start}</small></div>)}{data.people.map((person) => <div className="availability-row" key={person.id}><div className="availability-person"><PersonAvatar person={person} small /><div><strong>{person.name}</strong><small>{person.team}</small></div></div>{activeDay.blocks.map((block) => { const status = person.availability[activeDay.id]?.[block.id] ?? "available"; return <button key={block.id} className={`availability-block ${status}`} onClick={() => onAvailability(person.id, block.id)}><span>{status === "available" ? "✓" : status === "conditional" ? "~" : "×"}</span></button>; })}</div>)}</div></div></section>
    <section className="profile-notes"><div className="subhead"><div><span className="kicker">Reusable knowledge</span><h3>Preferences and private notes</h3></div></div><div className="profile-grid">{data.people.slice(0, 6).map((person) => <article key={person.id}><div className="profile-title"><PersonAvatar person={person} /><div><h4>{person.name}</h4><p>{person.team}</p></div></div><div className="tag-row">{person.preferences.map((preference) => <span key={preference}>{preference}</span>)}</div><p className="private-note"><b>Private</b>{person.privateNote}</p></article>)}</div></section>
  </div>;
}

function RolesView({ data, activeDay, dayId, setDayId, onOpen, onEditBlock, onDuplicateBlock }: { data: EventState; activeDay: EventDay; dayId: string; setDayId: (id: string) => void; onOpen: (assignment: Assignment) => void; onEditBlock: (blockId: string) => void; onDuplicateBlock: (blockId: string) => void }) {
  return <div className="content"><div className="section-title compact"><div><span className="kicker">Roles</span><h2>Roles and instructions</h2><p>Set defaults by block. Assign one exec or an available group, then override individuals as needed.</p></div><DayToggle data={data} dayId={dayId} setDayId={setDayId} /></div>{activeDay.blocks.length === 0 ? <section className="empty-builder"><h3>No blocks yet</h3><p>Add a schedule block first, then define its roles.</p></section> : <div className="role-blocks">{activeDay.blocks.map((block) => {
    const roles = blockRoles(block);
    return <section key={block.id}><header style={{ background: block.color }}><div><small>{block.start}–{block.end}</small><h3>{block.label}</h3></div><div className="block-header-actions"><span>{block.location || "Location not set"}</span><button onClick={() => onDuplicateBlock(block.id)}>Duplicate</button><button onClick={() => onEditBlock(block.id)}>Edit roles</button></div></header><div className="role-list">{roles.map((role) => {
      const assigned = activeDay.assignments.filter((assignment) => assignment.blockId === block.id && assignment.role === role.name);
      const first = assigned[0];
      const lead = data.people.find((person) => person.id === role.leadPersonId);
      return <button key={role.id} onClick={() => first ? onOpen(first) : onEditBlock(block.id)}><i style={{ background: roleColor(role.name) }} /><div><strong>{role.name}</strong><p>{role.description}</p><small>Lead: {lead?.name ?? "Not assigned"} · Target {role.target}</small></div><span className="member-stack">{assigned.slice(0, 3).map((assignment) => <PersonAvatar person={data.people.find((person) => person.id === assignment.personId)!} small key={assignment.id} />)}<b>{assigned.length ? assigned.map((assignment) => data.people.find((person) => person.id === assignment.personId)?.name).join(", ") : "No members assigned"}</b></span><em>→</em></button>;
    })}</div></section>;
  })}</div>}</div>;
}

function JudgingView({ data, onCycle }: { data: EventState; onCycle: (roomId: string, slotIndex: number) => void }) {
  return <div className="content"><div className="section-title compact"><div><span className="kicker">Competition module</span><h2>Five rooms. One live picture.</h2><p>Tap a team to move it from waiting to presenting, done, or dropped. Staff and room assignments stay tied to the master schedule.</p></div><div className="judging-legend"><span className="status-waiting">Waiting</span><span className="status-presenting">Presenting</span><span className="status-done">Done</span></div></div><div className="judging-grid">{data.judgingRooms.map((room) => <article key={room.id}><header><span>ROOM {room.id.split("-")[1]}</span><h3>{room.room}</h3><p>{room.judges}</p></header><div className="room-staff"><b>Timekeeper · Assistant · Dev</b><span>{room.staff}</span></div><div className="judging-slots">{room.slots.map((slot, index) => <button key={`${slot.time}-${slot.team}`} onClick={() => onCycle(room.id, index)} className={`status-${slot.status.toLowerCase()}`}><span>{slot.time}</span><strong>{slot.team}</strong><small>{slot.status}</small></button>)}</div></article>)}</div></div>;
}

function ResourcesView({ data, onSave }: { data: EventState; onSave: (resources: Resource[], contacts: ImportantContact[]) => void }) {
  const [editing, setEditing] = useState(false);
  const [resources, setResources] = useState<Resource[]>(() => structuredClone(data.resources));
  const [contacts, setContacts] = useState<ImportantContact[]>(() => structuredClone(data.contacts));
  const groups = Array.from(new Set(data.resources.map((resource) => resource.group)));
  if (editing) return <div className="content"><div className="section-title compact"><div><span className="kicker">Event overview</span><h2>Edit links and contacts</h2><p>This overview is shared with event directors and execs.</p></div></div><div className="overview-editor"><section><div className="form-section-head"><div><h3>Important documents</h3><p>Keep links at the event level unless a block truly needs its own reference.</p></div><button onClick={() => setResources((current) => [...current, { id: `resource-${Date.now()}`, label: "", group: "Operations", url: "" }])}>+ Add link</button></div><div className="overview-builder">{resources.map((resource, index) => <div key={resource.id}><input value={resource.label} placeholder="Document name" onChange={(event) => setResources((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} /><input value={resource.group} placeholder="Category" onChange={(event) => setResources((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, group: event.target.value } : item))} /><input value={resource.url} placeholder="https://…" onChange={(event) => setResources((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, url: event.target.value } : item))} /><button onClick={() => setResources((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${resource.label || "link"}`}>×</button></div>)}</div></section><section><div className="form-section-head"><div><h3>Important people</h3><p>Names and phone numbers execs may need during the event.</p></div><button onClick={() => setContacts((current) => [...current, { id: `contact-${Date.now()}`, name: "", role: "", phone: "" }])}>+ Add person</button></div><div className="overview-builder contacts">{contacts.map((contact, index) => <div key={contact.id}><input value={contact.name} placeholder="Name" onChange={(event) => setContacts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} /><input value={contact.role} placeholder="Role" onChange={(event) => setContacts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, role: event.target.value } : item))} /><input value={contact.phone} placeholder="Phone" onChange={(event) => setContacts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, phone: event.target.value } : item))} /><button onClick={() => setContacts((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${contact.name || "contact"}`}>×</button></div>)}</div></section><div className="editor-actions"><button className="button secondary" onClick={() => { setResources(structuredClone(data.resources)); setContacts(structuredClone(data.contacts)); setEditing(false); }}>Cancel</button><button className="button primary" onClick={() => { onSave(resources.filter((item) => item.label.trim() && item.url.trim()), contacts.filter((item) => item.name.trim() && item.phone.trim())); setEditing(false); }}>Save overview</button></div></div></div>;
  return <div className="content"><div className="section-title compact"><div><span className="kicker">Event overview</span><h2>Documents and contacts</h2><p>The shared reference page for event directors and execs.</p></div><button className="button primary" onClick={() => setEditing(true)}>Edit overview</button></div><div className="overview-grid"><section className="overview-panel"><header><span>↗</span><div><h3>Important documents</h3><p>{data.resources.length} links</p></div></header>{groups.map((group) => <div className="overview-group" key={group}><h4>{group}</h4>{data.resources.filter((resource) => resource.group === group).map((resource) => <a href={resource.url} key={resource.id}><span>{resource.label}</span><b>Open ↗</b></a>)}</div>)}{!data.resources.length ? <p className="empty-copy">No links added yet.</p> : null}</section><section className="overview-panel"><header><span>☎</span><div><h3>Important people</h3><p>{data.contacts.length} contacts</p></div></header><div className="contact-list">{data.contacts.map((contact) => <a href={`tel:${contact.phone}`} key={contact.id}><div><strong>{contact.name}</strong><span>{contact.role}</span></div><b>{contact.phone}</b></a>)}{!data.contacts.length ? <p className="empty-copy">No contacts added yet.</p> : null}</div></section></div></div>;
}

function EventLibraryDialog({ events, currentId, onClose, onSwitch, onNew }: { events: EventState[]; currentId: string; onClose: () => void; onSwitch: (event: EventState) => void; onNew: () => void }) {
  return <div className="drawer-backdrop centered" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="setup-dialog event-library" role="dialog" aria-modal="true" aria-label="Choose event"><header><div><span className="kicker">Your events</span><h2>Choose a workspace</h2></div><button onClick={onClose} aria-label="Close">×</button></header><div className="event-library-list">{events.map((event) => <button key={event.eventId} className={event.eventId === currentId ? "active" : ""} onClick={() => onSwitch(event)}><span className="event-mark">{event.eventName.slice(0, 2).toUpperCase()}</span><div><strong>{event.eventName}</strong><small>{event.eventType} · {event.dateRange} · {event.days.length} day{event.days.length === 1 ? "" : "s"}</small></div><b>{event.eventId === currentId ? "Current" : "Open →"}</b></button>)}</div><footer><button className="button primary" onClick={onNew}>+ Create new event</button></footer></section></div>;
}

function NewEventDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (values: { name: string; type: string; venue: string; startDate: string; dayCount: number }) => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("Conference");
  const [venue, setVenue] = useState("");
  const [startDate, setStartDate] = useState("");
  const [dayCount, setDayCount] = useState(1);
  return <div className="drawer-backdrop centered" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="setup-dialog" role="dialog" aria-modal="true" aria-label="Create a new event"><header><div><span className="kicker">New event</span><h2>Start with a blank canvas.</h2><p>Relay will create the days. You decide every block, role, lead, link, and assignment.</p></div><button onClick={onClose} aria-label="Close">×</button></header><div className="setup-form"><label>Event name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. BluePrint 2027" autoFocus /></label><div className="form-row"><label>Event type<select value={type} onChange={(event) => setType(event.target.value)}><option>Conference</option><option>Competition</option><option>Workshop</option><option>Social</option><option>Other</option></select></label><label>Number of days<input type="number" min="1" max="7" value={dayCount} onChange={(event) => setDayCount(Math.max(1, Math.min(7, Number(event.target.value))))} /></label></div><label>Venue<input value={venue} onChange={(event) => setVenue(event.target.value)} placeholder="Building, campus, or venue" /></label><label>First event date<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label></div><footer><button className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={!name.trim() || !startDate.trim()} onClick={() => onCreate({ name: name.trim(), type, venue: venue.trim() || "Venue TBD", startDate: startDate.trim(), dayCount })}>Create blank event</button></footer></section></div>;
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
  const [people, setPeople] = useState<Person[]>(() => structuredClone(data.people));
  const [groups, setGroups] = useState<ExecGroup[]>(() => structuredClone(data.groups));
  const [importText, setImportText] = useState("");
  const [newGroup, setNewGroup] = useState("");
  const updatePerson = (id: string, patch: Partial<Person>) => setPeople((current) => current.map((person) => person.id === id ? { ...person, ...patch } : person));
  const addGroup = (name: string) => {
    const clean = name.trim();
    if (!clean || groups.some((group) => group.name.toLowerCase() === clean.toLowerCase())) return groups.find((group) => group.name.toLowerCase() === clean.toLowerCase())?.id ?? "";
    const id = `${clean.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;
    setGroups((current) => [...current, { id, name: clean, color: "#d8d2ef" }]);
    return id;
  };
  const addPerson = () => {
    const id = `exec-${Date.now()}`;
    setPeople((current) => [...current, { id, name: "New exec", initials: "NE", team: groups[0]?.name ?? "Unassigned", color: "#d8d2ef", preferences: [], privateNote: "", phone: "", email: "", groupIds: groups[0] ? [groups[0].id] : [], availability: {} }]);
  };
  const importRoster = () => {
    const colorWheel = ["#ff8066", "#7f99ff", "#dfef79", "#b9a7ff", "#f8bb65", "#69c7b6"];
    const nextGroups = structuredClone(groups);
    const imported = importText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line, index) => {
      const [name = "", phone = "", email = "", groupNames = ""] = line.split(/\t|\s*,\s*/);
      const requestedGroups = groupNames.split(/[;+]/).map((item) => item.trim()).filter(Boolean);
      const groupIds = requestedGroups.map((groupName) => {
        let group = nextGroups.find((item) => item.name.toLowerCase() === groupName.toLowerCase());
        if (!group) {
          group = { id: `${groupName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}-${index}`, name: groupName, color: colorWheel[index % colorWheel.length] };
          nextGroups.push(group);
        }
        return group.id;
      });
      const id = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "exec"}-${Date.now()}-${index}`;
      return { id, name, initials: initialsFor(name), team: nextGroups.find((group) => groupIds.includes(group.id))?.name ?? "Unassigned", color: colorWheel[index % colorWheel.length], preferences: [], privateNote: "", phone, email, groupIds, availability: {} } satisfies Person;
    }).filter((person) => person.name);
    setGroups(nextGroups);
    setPeople((current) => [...current, ...imported.filter((person) => !current.some((existing) => Boolean(existing.email) && existing.email.toLowerCase() === person.email.toLowerCase() || existing.name.toLowerCase() === person.name.toLowerCase()))]);
    setImportText("");
  };
  return <div className="drawer-backdrop centered" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="setup-dialog roster-dialog" role="dialog" aria-modal="true" aria-label="Manage event roster"><header><div><span className="kicker">Current event</span><h2>Exec roster and groups</h2><p>Import a list, choose who belongs to this event, and update group membership.</p></div><button onClick={onClose} aria-label="Close">×</button></header><div className="roster-body"><section className="roster-import"><label>Import exec list<textarea rows={4} value={importText} onChange={(event) => setImportText(event.target.value)} placeholder={`Name, phone, email, group\nAlex Chen, 604-555-0100, alex@example.com, Development`} /></label><button className="button secondary" disabled={!importText.trim()} onClick={importRoster}>Add imported execs</button></section><section><div className="form-section-head"><div><h3>Groups</h3><p>An exec can belong to more than one group.</p></div><div className="inline-field"><input value={newGroup} onChange={(event) => setNewGroup(event.target.value)} placeholder="New group" /><button onClick={() => { addGroup(newGroup); setNewGroup(""); }}>Add</button></div></div><div className="group-chip-list">{groups.map((group) => <span style={{ background: group.color }} key={group.id}>{group.name}<button onClick={() => { setGroups((current) => current.filter((item) => item.id !== group.id)); setPeople((current) => current.map((person) => ({ ...person, groupIds: person.groupIds.filter((id) => id !== group.id) }))); }} aria-label={`Remove ${group.name}`}>×</button></span>)}</div></section><section><div className="form-section-head"><div><h3>{people.length} execs on this event</h3><p>Edit details or remove someone from this event only.</p></div><button onClick={addPerson}>+ Add exec</button></div><div className="roster-list">{people.map((person) => <article key={person.id}><PersonAvatar person={person} /><div className="roster-fields"><input value={person.name} aria-label="Name" onChange={(event) => updatePerson(person.id, { name: event.target.value, initials: initialsFor(event.target.value) })} /><input value={person.phone} aria-label="Phone" placeholder="Phone" onChange={(event) => updatePerson(person.id, { phone: event.target.value })} /><input value={person.email} aria-label="Email" placeholder="Email" onChange={(event) => updatePerson(person.id, { email: event.target.value })} /></div><div className="person-groups">{groups.map((group) => <label key={group.id}><input type="checkbox" checked={person.groupIds.includes(group.id)} onChange={(event) => updatePerson(person.id, { groupIds: event.target.checked ? [...person.groupIds, group.id] : person.groupIds.filter((id) => id !== group.id) })} />{group.name}</label>)}</div><button className="remove-row" onClick={() => setPeople((current) => current.filter((item) => item.id !== person.id))} aria-label={`Remove ${person.name}`}>×</button></article>)}</div></section></div><footer><button className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={!people.some((person) => person.name.trim())} onClick={() => onSave(people.filter((person) => person.name.trim()), groups)}>Save event roster</button></footer></section></div>;
}

function BlockEditor({ data, day, blockId, onClose, onSave }: { data: EventState; day: EventDay; blockId?: string; onClose: () => void; onSave: (block: EventBlock) => void }) {
  const existing = day.blocks.find((block) => block.id === blockId);
  const [id] = useState(() => existing?.id ?? `${day.id}-block-${Date.now()}`);
  const [label, setLabel] = useState(existing?.label ?? "");
  const [start, setStart] = useState(existing?.start ?? "9:00");
  const [end, setEnd] = useState(existing?.end ?? "10:00");
  const [location, setLocation] = useState(existing?.location ?? "");
  const [target, setTarget] = useState(existing?.target ?? 1);
  const [color, setColor] = useState(existing?.color ?? "#d8d2ef");
  const [roles, setRoles] = useState<BlockRole[]>(() => existing ? structuredClone(blockRoles(existing)) : []);
  const updateRole = (roleId: string, patch: Partial<BlockRole>) => setRoles((current) => current.map((role) => role.id === roleId ? { ...role, ...patch } : role));
  return <div className="drawer-backdrop centered" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="setup-dialog block-dialog" role="dialog" aria-modal="true" aria-label={`${existing ? "Edit" : "Add"} schedule block`}><header><div><span className="kicker">{day.label} · {existing ? "Edit block" : "New block"}</span><h2>{existing ? existing.label : "Add schedule block"}</h2><p>Set the time, optional location, roles, and instructions.</p></div><button onClick={onClose} aria-label="Close">×</button></header><div className="block-form"><section><h3>Block details</h3><label>Block name<input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. Registration" autoFocus /></label><div className="form-row three"><label>Start<input value={start} onChange={(event) => setStart(event.target.value)} /></label><label>End<input value={end} onChange={(event) => setEnd(event.target.value)} /></label><label>Ideal staff<input type="number" min="1" value={target} onChange={(event) => setTarget(Math.max(1, Number(event.target.value)))} /></label></div><label>Location <small>(optional)</small><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Fill in later" /></label><label>Block colour<input className="color-input" type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label></section><section><div className="form-section-head"><div><h3>Roles in this block</h3><p>Set the default lead and instructions before assigning members.</p></div><button type="button" onClick={() => setRoles((current) => [...current, { id: `${id}-role-${Date.now()}`, name: "", description: "", leadPersonId: "", target: 1, intensity: "Medium" }])}>+ Add role</button></div><div className="builder-list">{roles.map((role, index) => <article key={role.id}><div className="builder-row"><span>{String(index + 1).padStart(2, "0")}</span><input value={role.name} onChange={(event) => updateRole(role.id, { name: event.target.value })} placeholder="Role name" /><select value={role.leadPersonId} onChange={(event) => updateRole(role.id, { leadPersonId: event.target.value })}><option value="">Choose lead</option>{data.people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select><button type="button" onClick={() => setRoles((current) => current.filter((item) => item.id !== role.id))} aria-label={`Remove role ${role.name || index + 1}`}>×</button></div><textarea rows={2} value={role.description} onChange={(event) => updateRole(role.id, { description: event.target.value })} placeholder="What does this role need to do?" /><div className="builder-meta"><label>People needed<input type="number" min="1" value={role.target} onChange={(event) => updateRole(role.id, { target: Math.max(1, Number(event.target.value)) })} /></label><label>Intensity<select value={role.intensity} onChange={(event) => updateRole(role.id, { intensity: event.target.value as BlockRole["intensity"] })}><option>Low</option><option>Medium</option><option>High</option></select></label></div></article>)}</div></section></div><footer><button className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={!label.trim()} onClick={() => onSave({ id, label: label.trim(), short: label.slice(0, 3).toUpperCase(), start, end, location: location.trim(), color, target, requiredRoles: roles.map((role) => role.name.trim()).filter(Boolean), roles: roles.filter((role) => role.name.trim()).map((role) => ({ ...role, name: role.name.trim(), description: role.description.trim() || roleDescriptions[role.name.trim()] || `Support ${label}.` })), links: existing?.links ?? [] })}>{existing ? "Save block" : "Add block"}</button></footer></section></div>;
}

function AssignmentDrawer({ data, day, drawer, onClose, onSave }: { data: EventState; day: EventDay; drawer: { blockId: string; personId: string; assignmentId?: string }; onClose: () => void; onSave: (values: { personIds: string[]; role: string; lead: string; leadPersonId: string; description: string; intensity: Assignment["intensity"] }) => void }) {
  const existing = day.assignments.find((assignment) => assignment.id === drawer.assignmentId);
  const block = day.blocks.find((item) => item.id === drawer.blockId)!;
  const availableRoles = blockRoles(block);
  const initialRole = existing?.role ?? availableRoles[0]?.name ?? "On Call";
  const initialRoleDetail = availableRoles.find((item) => item.name === initialRole);
  const [personId, setPersonId] = useState(existing?.personId ?? drawer.personId);
  const [role, setRole] = useState(initialRole);
  const [leadPersonId, setLeadPersonId] = useState(existing?.leadPersonId ?? initialRoleDetail?.leadPersonId ?? "");
  const [description, setDescription] = useState(existing?.description ?? initialRoleDetail?.description ?? roleDescriptions[initialRole] ?? "Check in with the event directors before this block begins.");
  const [intensity, setIntensity] = useState<Assignment["intensity"]>(existing?.intensity ?? initialRoleDetail?.intensity ?? "Medium");
  const [search, setSearch] = useState("");
  const [assignMode, setAssignMode] = useState<"person" | "group">("person");
  const [groupId, setGroupId] = useState(data.groups[0]?.id ?? "");
  const candidates = data.people.map((person) => ({ person, fit: candidateFit(person, role, day, block) })).filter(({ person }) => `${person.name} ${person.team} ${person.groupIds.map((id) => data.groups.find((group) => group.id === id)?.name ?? "").join(" ")} ${person.preferences.join(" ")}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => b.fit.score - a.fit.score || a.person.name.localeCompare(b.person.name));
  const groupCandidates = candidates.filter(({ person, fit }) => person.groupIds.includes(groupId) && fit.status === "available");
  const selectRole = (nextRole: string) => {
    setRole(nextRole);
    const detail = availableRoles.find((item) => item.name === nextRole);
    setDescription(detail?.description ?? roleDescriptions[nextRole] ?? description);
    setLeadPersonId(detail?.leadPersonId ?? "");
    setIntensity(detail?.intensity ?? "Medium");
  };
  const lead = data.people.find((person) => person.id === leadPersonId)?.name ?? "Event Directors";
  return <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="assignment-drawer" role="dialog" aria-modal="true" aria-label="Edit assignment"><header><div><span className="kicker">{existing ? "Edit assignment" : "New assignment"}</span><h2>{block.label}</h2><p>{block.start}–{block.end}{block.location ? ` · ${block.location}` : ""}</p></div><button onClick={onClose} aria-label="Close">×</button></header><div className="drawer-body"><label>Role<select value={role} onChange={(event) => selectRole(event.target.value)}>{availableRoles.map((item) => <option value={item.name} key={item.id}>{item.name}</option>)}{!availableRoles.some((item) => item.name === role) ? <option value={role}>{role}</option> : null}</select></label><label>Role lead<select value={leadPersonId} onChange={(event) => setLeadPersonId(event.target.value)}><option value="">Event Directors</option>{data.people.map((person) => <option value={person.id} key={person.id}>{person.name}</option>)}</select></label><div className="field"><span>Intensity</span><div className="intensity-toggle">{(["Low", "Medium", "High"] as const).map((item) => <button type="button" className={intensity === item ? "active" : ""} onClick={() => setIntensity(item)} key={item}>{item}</button>)}</div></div><label>Instructions<textarea rows={5} value={description} onChange={(event) => setDescription(event.target.value)} /></label>{!existing ? <div className="assign-mode"><button className={assignMode === "person" ? "active" : ""} onClick={() => setAssignMode("person")}>One exec</button><button className={assignMode === "group" ? "active" : ""} onClick={() => setAssignMode("group")}>Available group</button></div> : null}{assignMode === "group" && !existing ? <div className="group-assignment"><label>Exec group<select value={groupId} onChange={(event) => setGroupId(event.target.value)}>{data.groups.map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}</select></label><p><strong>{groupCandidates.length}</strong> available member{groupCandidates.length === 1 ? "" : "s"} will be assigned. Conditional and unavailable members are skipped; individual assignments can still be changed afterward.</p><div className="group-preview">{groupCandidates.map(({ person }) => <span key={person.id}><PersonAvatar person={person} small />{person.name}</span>)}</div></div> : <><div className="candidate-head"><span>Assign to</span><small>Sorted by availability and fit</small></div><label className="candidate-search"><span>Search execs</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, group, or preference…" /></label><div className="candidate-list">{candidates.map(({ person, fit }, index) => <button type="button" className={personId === person.id ? "selected" : ""} key={person.id} onClick={() => setPersonId(person.id)}><PersonAvatar person={person} /><div><strong>{person.name}{index === 0 && !search ? <em>Top fit</em> : null}</strong><small>{fit.reason}</small></div><span className={`candidate-status ${fit.status}`}>{fit.status}</span></button>)}</div></>}</div><footer><button className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={assignMode === "group" && !groupCandidates.length} onClick={() => onSave({ personIds: assignMode === "group" && !existing ? groupCandidates.map(({ person }) => person.id) : [personId], role, lead, leadPersonId, description, intensity })}>{assignMode === "group" && !existing ? `Assign ${groupCandidates.length} execs` : "Save assignment"}</button></footer></aside></div>;
}

function ExecView({ data, person, dayId, setDayId, section, setSection, onAvailability, onExit }: { data: EventState; person: Person; dayId: string; setDayId: (id: string) => void; section: ExecSection; setSection: (section: ExecSection) => void; onAvailability: (personId: string, dayId: string, blockId: string) => void; onExit: () => void }) {
  const day = data.days.find((item) => item.id === dayId) ?? data.days[0];
  const assignments = day.assignments.filter((assignment) => assignment.personId === person.id);
  const next = assignments[0];
  const nextBlock = day.blocks.find((block) => block.id === next?.blockId);
  const eventRoles = data.days.flatMap((eventDay) => eventDay.blocks.flatMap((block) => blockRoles(block).map((role) => ({ role, block: `${eventDay.label} · ${block.label}` })))).filter((entry, index, entries) => entries.findIndex((item) => item.role.name === entry.role.name) === index);
  return <div className="exec-app"><header className="exec-header"><button className="exec-brand" onClick={() => setSection("today")}><span>R</span> relay</button><div><button className="icon-button" aria-label="Notifications">•<span /></button><button className="exec-profile"><PersonAvatar person={person} /><span>{person.name}</span></button><button className="exit-preview" onClick={onExit}>Exit preview</button></div></header><main>
    {section === "today" && <><section className="exec-welcome"><div><span className="kicker">Good morning, {person.name}</span><h1>My day</h1><p>{day.date} · {data.venue}</p></div><DayToggle data={data} dayId={dayId} setDayId={setDayId} /></section>{next && nextBlock ? <section className="next-card"><div className="next-time"><span>NEXT UP</span><strong>{nextBlock.start}</strong><small>{nextBlock.end}</small></div><div className="next-main"><span className="role-label" style={{ background: next.color }}>{next.role}</span><h2>{nextBlock.label}</h2><p className="next-place">{nextBlock.location ? `⌖ ${nextBlock.location} · ` : ""}Lead: {assignmentLeadName(next, data.people)}</p><p>{next.description}</p><div className="next-people"><span>With</span>{day.assignments.filter((a) => a.blockId === next.blockId && a.role === next.role && a.personId !== person.id).slice(0, 3).map((a) => <PersonAvatar key={a.id} small person={data.people.find((p) => p.id === a.personId)!} />)}</div></div><button className="acknowledge">✓ I’m ready</button></section> : null}<section className="my-day"><div className="subhead"><div><span className="kicker">Itinerary</span><h3>{assignments.length} roles today</h3></div><button className="text-button" onClick={() => setSection("schedule")}>Whole event →</button></div><div className="itinerary">{assignments.map((assignment, index) => { const block = day.blocks.find((item) => item.id === assignment.blockId)!; return <article key={assignment.id} className={index === 0 ? "current" : ""}><div className="itinerary-time"><strong>{block.start}</strong><span>{block.end}</span></div><i style={{ background: assignment.color }} /><div><span>{block.label}</span><h4>{assignment.role}</h4><p>{block.location ? `${block.location} · ` : ""}{assignmentLeadName(assignment, data.people)}</p></div><button aria-label={`Open ${assignment.role}`}>→</button></article>; })}</div></section><section className="quick-links"><div className="subhead"><div><span className="kicker">Event overview</span><h3>Important links</h3></div><button className="text-button" onClick={() => setSection("overview")}>View all →</button></div><div>{data.resources.slice(0, 4).map((resource) => <a href={resource.url} key={resource.id}><span>{resource.group.slice(0, 2).toUpperCase()}</span><strong>{resource.label}</strong><b>↗</b></a>)}</div></section></>}
    {section === "schedule" && <section className="exec-full-schedule"><span className="kicker">Published schedule</span><h1>Event schedule</h1><p>Every block, role, and assignment.</p>{data.days.map((scheduleDay) => <section className="exec-schedule-day" key={scheduleDay.id}><header><span>{scheduleDay.label}</span><h2>{scheduleDay.date}</h2></header><div>{scheduleDay.blocks.map((block) => { const assignmentsForBlock = scheduleDay.assignments.filter((assignment) => assignment.blockId === block.id); return <article key={block.id}><div className="full-schedule-time" style={{ background: block.color }}><strong>{block.start}</strong><span>{block.end}</span></div><div className="full-schedule-main"><span>{block.location || "Location not set"}</span><h3>{block.label}</h3><div className="full-role-list">{blockRoles(block).map((role) => { const roleAssignments = assignmentsForBlock.filter((assignment) => assignment.role === role.name); const lead = data.people.find((item) => item.id === role.leadPersonId); return <div key={role.id}><strong>{role.name}</strong><span>Lead: {lead?.name ?? (roleAssignments[0] ? assignmentLeadName(roleAssignments[0], data.people) : "TBD")}</span><small>{roleAssignments.map((assignment) => data.people.find((item) => item.id === assignment.personId)?.name).filter(Boolean).join(", ") || "Team not assigned"}</small></div>; })}</div></div></article>; })}</div></section>)}</section>}
    {section === "availability" && <section className="exec-availability"><span className="kicker">Your availability</span><h1>When can you be there?</h1><p>Complete the entire event schedule below. Tap each block to cycle between available, conditional, and unavailable.</p>{data.days.map((availabilityDay) => <section className="availability-day" key={availabilityDay.id}><header><span>{availabilityDay.label}</span><h2>{availabilityDay.date}</h2></header><div className="exec-availability-list">{availabilityDay.blocks.map((block) => { const status = person.availability[availabilityDay.id]?.[block.id] ?? "available"; return <button className={status} key={block.id} onClick={() => onAvailability(person.id, availabilityDay.id, block.id)}><div><strong>{block.start}</strong><span>{block.end}</span></div><div><h3>{block.label}</h3><p>{block.location}</p></div><b>{status === "available" ? "Available" : status === "conditional" ? "Conditional" : "Unavailable"}</b></button>; })}</div></section>)}<label className="availability-note">Anything we should know?<textarea rows={4} defaultValue="Please avoid back-to-back physical roles after lunch if possible." /></label><button className="button primary full">Save availability</button></section>}
    {section === "overview" && <section className="exec-overview"><span className="kicker">Shared reference</span><h1>Event overview</h1><p>Important documents and people for {data.eventName}.</p><div className="overview-grid"><section className="overview-panel"><header><span>↗</span><div><h3>Documents</h3><p>{data.resources.length} links</p></div></header>{Array.from(new Set(data.resources.map((resource) => resource.group))).map((group) => <div className="overview-group" key={group}><h4>{group}</h4>{data.resources.filter((resource) => resource.group === group).map((resource) => <a href={resource.url} key={resource.id}><span>{resource.label}</span><b>Open ↗</b></a>)}</div>)}</section><section className="overview-panel"><header><span>☎</span><div><h3>Important people</h3><p>{data.contacts.length} contacts</p></div></header><div className="contact-list">{data.contacts.map((contact) => <a href={`tel:${contact.phone}`} key={contact.id}><div><strong>{contact.name}</strong><span>{contact.role}</span></div><b>{contact.phone}</b></a>)}</div></section></div></section>}
    {section === "directory" && <section className="exec-directory"><span className="kicker">Role directory</span><h1>Role instructions</h1><p>Instructions from the published schedule.</p><div className="directory-list">{eventRoles.map(({ role, block }) => { const lead = data.people.find((item) => item.id === role.leadPersonId); return <details key={role.name}><summary><i style={{ background: roleColor(role.name) }} /><span>{role.name}</span><b>+</b></summary><p>{role.description} Lead: {lead?.name ?? "TBD"}. First used in {block}.</p></details>; })}</div>{!eventRoles.length ? <p>No roles have been added to the schedule yet.</p> : null}</section>}
  </main><nav className="exec-nav" aria-label="Exec navigation">{(["today", "schedule", "availability", "overview", "directory"] as ExecSection[]).map((item) => <button key={item} className={section === item ? "active" : ""} onClick={() => setSection(item)}><span>{item === "today" ? "◷" : item === "schedule" ? "▤" : item === "availability" ? "▦" : item === "overview" ? "↗" : "≡"}</span>{item === "today" ? "My day" : item[0].toUpperCase() + item.slice(1)}</button>)}</nav></div>;
}
