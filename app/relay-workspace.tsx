"use client";

import { useEffect, useMemo, useState } from "react";

type AvailabilityStatus = "available" | "conditional" | "unavailable";
type Section = "schedule" | "people" | "roles" | "judging" | "resources";
type ExecSection = "today" | "availability" | "directory";

type Person = {
  id: string;
  name: string;
  initials: string;
  team: string;
  color: string;
  preferences: string[];
  privateNote: string;
  availability: Record<string, Record<string, AvailabilityStatus>>;
};

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
};

type Assignment = {
  id: string;
  personId: string;
  blockId: string;
  role: string;
  lead: string;
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
  eventName: string;
  eventType: string;
  dateRange: string;
  venue: string;
  publishedAt: string;
  draftChanges: number;
  people: Person[];
  days: EventDay[];
  resources: Resource[];
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
  eventName: "ProductX 2026",
  eventType: "Competition",
  dateRange: "March 21–22, 2026",
  venue: "Henry Angus Building",
  publishedAt: "Aug 3, 2:14 PM",
  draftChanges: 3,
  people: peopleBase.map(([id, name, initials, team, color, preferences]) => ({
    id, name, initials, team, color, preferences: [...preferences],
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
  judgingRooms: ["HA 241", "HA 243", "HA 254", "HA 292", "HA 296"].map((room, roomIndex) => ({
    id: `room-${roomIndex + 1}`, room,
    judges: ["Jordyn + Yohen", "Timothy + Sophie", "Riza + Lily", "Camile + Rodolfo", "Yudhvir + Huan"][roomIndex],
    staff: ["Dane · Eliana · Isaac", "Grace · Ethan · Benny", "Gautham · Angela · Ethan", "Lillian · Jay · Isaac", "Cheryl · Dane · Benny"][roomIndex],
    slots: ["1:30", "1:45", "2:00", "2:15", "2:30"].map((time, index) => ({ time, team: `Team ${roomIndex * 5 + index + 1}`, status: index === 0 ? "Presenting" as const : "Waiting" as const })),
  })),
};

function PersonAvatar({ person, small = false }: { person: Person; small?: boolean }) {
  return <span className={`avatar ${small ? "avatar-small" : ""}`} style={{ background: person.color }}>{person.initials}</span>;
}

export function RelayWorkspace() {
  const [data, setData] = useState<EventState>(seedData);
  const [hydrated, setHydrated] = useState(false);
  const [mode, setMode] = useState<"director" | "exec">("director");
  const [section, setSection] = useState<Section>("schedule");
  const [execSection, setExecSection] = useState<ExecSection>("today");
  const [dayId, setDayId] = useState("day2");
  const [drawer, setDrawer] = useState<{ blockId: string; personId: string; assignmentId?: string } | null>(null);
  const [toast, setToast] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/event-state")
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((payload) => { if (payload.state) setData(payload.state); })
      .catch(() => undefined)
      .finally(() => setHydrated(true));
  }, []);

  const save = async (next: EventState, message: string) => {
    setData(next);
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
    }
    items.push({ level: "Flow", title: "Two tight location changes", detail: "Day 2 · 12:30–1:30 · allow a 10-minute judging buffer" });
    items.push({ level: "Workload", title: "Lillian has six active blocks", detail: "Day 2 · one high-intensity stretch has no break" });
    return items;
  }, [data]);

  const distinctRequired = activeDay.blocks.flatMap((block) => block.requiredRoles.map((role) => `${block.id}:${role}`));
  const covered = distinctRequired.filter((key) => {
    const [blockId, role] = key.split(":");
    return activeAssignments.some((assignment) => assignment.blockId === blockId && assignment.role === role);
  }).length;

  const publish = () => {
    const next = { ...data, draftChanges: 0, publishedAt: "Just now" };
    void save(next, "Published. Everyone’s view is up to date.");
  };

  const saveAssignment = (values: { personId: string; role: string; lead: string; description: string; intensity: Assignment["intensity"] }) => {
    if (!drawer) return;
    const next = structuredClone(data);
    const day = next.days.find((item) => item.id === dayId)!;
    if (drawer.assignmentId) {
      const assignment = day.assignments.find((item) => item.id === drawer.assignmentId)!;
      Object.assign(assignment, values, { color: roleColor(values.role) });
    } else {
      day.assignments.push({ id: `${drawer.blockId}-${values.personId}-${Date.now()}`, blockId: drawer.blockId, color: roleColor(values.role), ...values });
    }
    next.draftChanges += 1;
    setDrawer(null);
    void save(next, "Assignment saved to the shared event.");
  };

  const updateAvailability = (personId: string, blockId: string) => {
    const next = structuredClone(data);
    const person = next.people.find((item) => item.id === personId)!;
    const current = person.availability[dayId][blockId];
    person.availability[dayId][blockId] = current === "available" ? "conditional" : current === "conditional" ? "unavailable" : "available";
    next.draftChanges += 1;
    void save(next, "Availability updated.");
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
            <div className="event-mini"><span className="event-mark">PX</span><div><strong>ProductX</strong><small>Mar 21–22</small></div><button aria-label="Open event menu">•••</button></div>
            <nav aria-label="Director workspace">
              {([[
                "schedule", "Schedule", "01"
              ], ["people", "People + availability", "02"], ["roles", "Roles + instructions", "03"], ["judging", "Judging rooms", "04"], ["resources", "Important links", "05"]] as [Section, string, string][]).map(([id, label, number]) => (
                <button key={id} className={section === id ? "active" : ""} onClick={() => setSection(id)}><span>{number}</span>{label}{id === "schedule" && warnings.length > 0 ? <b>{warnings.length}</b> : null}</button>
              ))}
            </nav>
            <div className="sidebar-bottom"><button onClick={() => setMode("exec")}><span className="avatar avatar-small" style={{ background: currentExec.color }}>{currentExec.initials}</span><div><strong>Preview as exec</strong><small>{currentExec.name}</small></div><span>↗</span></button></div>
          </aside>
          <main className="workspace">
            <header className="workspace-header">
              <div><div className="eyebrow">{data.eventType} · {data.venue}</div><h1>{data.eventName}</h1><p>{data.dateRange} <span>•</span> Published {data.publishedAt}</p></div>
              <div className="header-actions"><span className={`save-state ${saving ? "saving" : ""}`}>{saving ? "Saving…" : hydrated ? "All changes saved" : "Connecting…"}</span><button className="button secondary" onClick={() => setMode("exec")}>Exec view</button><button className="button primary" onClick={publish} disabled={data.draftChanges === 0}>Publish {data.draftChanges ? `${data.draftChanges} changes` : "changes"}</button></div>
            </header>

            {section === "schedule" && <ScheduleView data={data} activeDay={activeDay} dayId={dayId} setDayId={setDayId} warnings={warnings} covered={covered} required={distinctRequired.length} onCell={(blockId, personId, assignmentId) => setDrawer({ blockId, personId, assignmentId })} />}
            {section === "people" && <PeopleView data={data} activeDay={activeDay} dayId={dayId} setDayId={setDayId} onAvailability={updateAvailability} />}
            {section === "roles" && <RolesView data={data} activeDay={activeDay} dayId={dayId} setDayId={setDayId} onOpen={(assignment) => setDrawer({ blockId: assignment.blockId, personId: assignment.personId, assignmentId: assignment.id })} />}
            {section === "judging" && <JudgingView data={data} onCycle={cycleJudgingStatus} />}
            {section === "resources" && <ResourcesView data={data} />}
          </main>
          {drawer && <AssignmentDrawer data={data} day={activeDay} drawer={drawer} onClose={() => setDrawer(null)} onSave={saveAssignment} />}
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

function ScheduleView({ data, activeDay, dayId, setDayId, warnings, covered, required, onCell }: { data: EventState; activeDay: EventDay; dayId: string; setDayId: (id: string) => void; warnings: { level: string; title: string; detail: string }[]; covered: number; required: number; onCell: (blockId: string, personId: string, assignmentId?: string) => void }) {
  return <div className="content schedule-content">
    <div className="section-title"><div><span className="kicker">Live workspace</span><h2>Build the flow, keep the judgment.</h2><p>Assign people directly. Relay checks availability, workload, and transitions while every downstream view stays in sync.</p></div><DayToggle data={data} dayId={dayId} setDayId={setDayId} /></div>
    <div className="stat-strip">
      <div><span>Role coverage</span><strong>{covered}/{required}</strong><small>core roles staffed</small></div>
      <div><span>People scheduled</span><strong>{new Set(activeDay.assignments.map((a) => a.personId)).size}/{data.people.length}</strong><small>available execs</small></div>
      <div><span>Needs attention</span><strong>{warnings.length}</strong><small>all overridable</small></div>
      <div className="publish-card"><span>Published plan</span><strong>{data.draftChanges ? `${data.draftChanges} edits ahead` : "Up to date"}</strong><small>Last publish {data.publishedAt}</small></div>
    </div>
    <section className="board-card">
      <div className="board-toolbar"><div><strong>{activeDay.date}</strong><span>{activeDay.blocks[0].start} AM – {activeDay.blocks.at(-1)?.end} PM</span></div><div className="legend"><span><i className="legend-dot available" />Available</span><span><i className="legend-dot conditional" />Conditional</span><span><i className="legend-dot conflict" />Conflict</span></div></div>
      <div className="timeline-scroll">
        <div className="timeline" style={{ "--columns": activeDay.blocks.length } as React.CSSProperties}>
          <div className="timeline-corner">Person</div>
          {activeDay.blocks.map((block) => <div className="block-head" key={block.id} style={{ background: block.color }}><small>{block.start}–{block.end}</small><strong>{block.label}</strong><span>{block.location}</span></div>)}
          {data.people.map((person) => <div className="timeline-row" key={person.id}>
            <div className="person-cell"><PersonAvatar person={person} small /><div><strong>{person.name}</strong><small>{activeDay.assignments.filter((a) => a.personId === person.id).length} roles</small></div></div>
            {activeDay.blocks.map((block) => {
              const assignment = activeDay.assignments.find((item) => item.personId === person.id && item.blockId === block.id);
              const availability = person.availability[activeDay.id]?.[block.id] ?? "available";
              return <button className={`assignment-cell ${availability}`} key={block.id} onClick={() => onCell(block.id, person.id, assignment?.id)} aria-label={`${person.name}, ${block.label}${assignment ? `, ${assignment.role}` : ", add assignment"}`}>
                {assignment ? <span className="role-chip" style={{ background: assignment.color }}>{assignment.role}<i>{assignment.intensity.slice(0, 1)}</i></span> : <span className="add-role">+</span>}
              </button>;
            })}
          </div>)}
        </div>
      </div>
    </section>
    <section className="attention-section"><div className="subhead"><div><span className="kicker">Human review</span><h3>What needs your judgment</h3></div><button className="text-button">View all checks →</button></div><div className="warning-grid">{warnings.slice(0, 3).map((warning, index) => <article key={`${warning.title}-${index}`}><span className={`warning-type w-${warning.level.toLowerCase()}`}>{warning.level}</span><h4>{warning.title}</h4><p>{warning.detail}</p><button>Review in schedule <span>→</span></button></article>)}</div></section>
  </div>;
}

function PeopleView({ data, activeDay, dayId, setDayId, onAvailability }: { data: EventState; activeDay: EventDay; dayId: string; setDayId: (id: string) => void; onAvailability: (personId: string, blockId: string) => void }) {
  return <div className="content"><div className="section-title compact"><div><span className="kicker">Availability</span><h2>Know who can actually be there.</h2><p>Click any cell to cycle between available, conditional, and unavailable.</p></div><DayToggle data={data} dayId={dayId} setDayId={setDayId} /></div>
    <div className="people-summary"><div><strong>{data.people.length}</strong><span>responses received</span></div><div><strong>3</strong><span>availability caveats</span></div><button className="button primary">Share availability link</button></div>
    <section className="availability-card"><div className="availability-scroll"><div className="availability-grid" style={{ "--columns": activeDay.blocks.length } as React.CSSProperties}><div className="availability-corner">Exec</div>{activeDay.blocks.map((block) => <div className="availability-head" key={block.id}><strong>{block.short}</strong><small>{block.start}</small></div>)}{data.people.map((person) => <div className="availability-row" key={person.id}><div className="availability-person"><PersonAvatar person={person} small /><div><strong>{person.name}</strong><small>{person.team}</small></div></div>{activeDay.blocks.map((block) => { const status = person.availability[activeDay.id]?.[block.id] ?? "available"; return <button key={block.id} className={`availability-block ${status}`} onClick={() => onAvailability(person.id, block.id)}><span>{status === "available" ? "✓" : status === "conditional" ? "~" : "×"}</span></button>; })}</div>)}</div></div></section>
    <section className="profile-notes"><div className="subhead"><div><span className="kicker">Reusable knowledge</span><h3>Preferences and private notes</h3></div></div><div className="profile-grid">{data.people.slice(0, 6).map((person) => <article key={person.id}><div className="profile-title"><PersonAvatar person={person} /><div><h4>{person.name}</h4><p>{person.team}</p></div></div><div className="tag-row">{person.preferences.map((preference) => <span key={preference}>{preference}</span>)}</div><p className="private-note"><b>Private</b>{person.privateNote}</p></article>)}</div></section>
  </div>;
}

function RolesView({ data, activeDay, dayId, setDayId, onOpen }: { data: EventState; activeDay: EventDay; dayId: string; setDayId: (id: string) => void; onOpen: (assignment: Assignment) => void }) {
  return <div className="content"><div className="section-title compact"><div><span className="kicker">Role directory</span><h2>Instructions that never drift.</h2><p>Every name, lead, time, and location is generated from the same assignments used in the schedule.</p></div><DayToggle data={data} dayId={dayId} setDayId={setDayId} /></div><div className="role-blocks">{activeDay.blocks.map((block) => { const roles = Array.from(new Set(activeDay.assignments.filter((a) => a.blockId === block.id).map((a) => a.role))); return <section key={block.id}><header style={{ background: block.color }}><div><small>{block.start}–{block.end}</small><h3>{block.label}</h3></div><span>{block.location}</span></header><div className="role-list">{roles.map((role) => { const assigned = activeDay.assignments.filter((a) => a.blockId === block.id && a.role === role); const first = assigned[0]; return <button key={role} onClick={() => onOpen(first)}><i style={{ background: first.color }} /><div><strong>{role}</strong><p>{first.description}</p></div><span className="member-stack">{assigned.slice(0, 3).map((a) => { const person = data.people.find((p) => p.id === a.personId)!; return <PersonAvatar person={person} small key={a.id} />; })}<b>{assigned.map((a) => data.people.find((p) => p.id === a.personId)?.name).join(", ")}</b></span><em>→</em></button>; })}</div></section>; })}</div></div>;
}

function JudgingView({ data, onCycle }: { data: EventState; onCycle: (roomId: string, slotIndex: number) => void }) {
  return <div className="content"><div className="section-title compact"><div><span className="kicker">Competition module</span><h2>Five rooms. One live picture.</h2><p>Tap a team to move it from waiting to presenting, done, or dropped. Staff and room assignments stay tied to the master schedule.</p></div><div className="judging-legend"><span className="status-waiting">Waiting</span><span className="status-presenting">Presenting</span><span className="status-done">Done</span></div></div><div className="judging-grid">{data.judgingRooms.map((room) => <article key={room.id}><header><span>ROOM {room.id.split("-")[1]}</span><h3>{room.room}</h3><p>{room.judges}</p></header><div className="room-staff"><b>Timekeeper · Assistant · Dev</b><span>{room.staff}</span></div><div className="judging-slots">{room.slots.map((slot, index) => <button key={`${slot.time}-${slot.team}`} onClick={() => onCycle(room.id, index)} className={`status-${slot.status.toLowerCase()}`}><span>{slot.time}</span><strong>{slot.team}</strong><small>{slot.status}</small></button>)}</div></article>)}</div></div>;
}

function ResourcesView({ data }: { data: EventState }) {
  const groups = Array.from(new Set(data.resources.map((resource) => resource.group)));
  return <div className="content"><div className="section-title compact"><div><span className="kicker">Important links</span><h2>The right document, right when it matters.</h2><p>Keep operational links beside the event instead of scattering them across messages and spreadsheet tabs.</p></div><button className="button primary">Add resource</button></div><div className="resource-grid">{groups.map((group) => <section key={group}><header><span>{group.slice(0, 2).toUpperCase()}</span><div><h3>{group}</h3><p>{data.resources.filter((resource) => resource.group === group).length} resources</p></div></header>{data.resources.filter((resource) => resource.group === group).map((resource) => <a href={resource.url} key={resource.id}><span>{resource.label}</span><b>Open ↗</b></a>)}</section>)}</div></div>;
}

function AssignmentDrawer({ data, day, drawer, onClose, onSave }: { data: EventState; day: EventDay; drawer: { blockId: string; personId: string; assignmentId?: string }; onClose: () => void; onSave: (values: { personId: string; role: string; lead: string; description: string; intensity: Assignment["intensity"] }) => void }) {
  const existing = day.assignments.find((assignment) => assignment.id === drawer.assignmentId);
  const block = day.blocks.find((item) => item.id === drawer.blockId)!;
  const [personId, setPersonId] = useState(existing?.personId ?? drawer.personId);
  const [role, setRole] = useState(existing?.role ?? block.requiredRoles[0] ?? "On Call");
  const [lead, setLead] = useState(existing?.lead ?? "Event Directors");
  const [description, setDescription] = useState(existing?.description ?? roleDescriptions[role] ?? "Check in with the event directors before this block begins.");
  const [intensity, setIntensity] = useState<Assignment["intensity"]>(existing?.intensity ?? "Medium");
  const candidates = [...data.people].sort((a, b) => {
    const rank = (person: Person) => person.availability[day.id]?.[block.id] === "available" ? 0 : person.availability[day.id]?.[block.id] === "conditional" ? 1 : 2;
    return rank(a) - rank(b);
  });
  return <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="assignment-drawer" role="dialog" aria-modal="true" aria-label="Edit assignment"><header><div><span className="kicker">{existing ? "Edit assignment" : "New assignment"}</span><h2>{block.label}</h2><p>{block.start}–{block.end} · {block.location}</p></div><button onClick={onClose} aria-label="Close">×</button></header><div className="drawer-body"><label>Role<input value={role} onChange={(event) => { const nextRole = event.target.value; setRole(nextRole); if (!existing && roleDescriptions[nextRole]) setDescription(roleDescriptions[nextRole]); }} list="role-options" /><datalist id="role-options">{Object.keys(roleDescriptions).map((item) => <option value={item} key={item} />)}</datalist></label><label>Lead<input value={lead} onChange={(event) => setLead(event.target.value)} /></label><div className="field"><span>Intensity</span><div className="intensity-toggle">{(["Low", "Medium", "High"] as const).map((item) => <button className={intensity === item ? "active" : ""} onClick={() => setIntensity(item)} key={item}>{item}</button>)}</div></div><label>Instructions<textarea rows={5} value={description} onChange={(event) => setDescription(event.target.value)} /></label><div className="candidate-head"><span>Assign to</span><small>Sorted by fit for this block</small></div><div className="candidate-list">{candidates.map((person) => { const status = person.availability[day.id]?.[block.id] ?? "available"; const load = day.assignments.filter((a) => a.personId === person.id).length; return <button className={personId === person.id ? "selected" : ""} key={person.id} onClick={() => setPersonId(person.id)}><PersonAvatar person={person} /><div><strong>{person.name}</strong><small>{person.preferences.includes(role) ? "Preferred role · " : ""}{load} assignments</small></div><span className={`candidate-status ${status}`}>{status}</span></button>; })}</div></div><footer><button className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" onClick={() => onSave({ personId, role, lead, description, intensity })}>Save assignment</button></footer></aside></div>;
}

function ExecView({ data, person, dayId, setDayId, section, setSection, onAvailability, onExit }: { data: EventState; person: Person; dayId: string; setDayId: (id: string) => void; section: ExecSection; setSection: (section: ExecSection) => void; onAvailability: (personId: string, blockId: string) => void; onExit: () => void }) {
  const day = data.days.find((item) => item.id === dayId) ?? data.days[0];
  const assignments = day.assignments.filter((assignment) => assignment.personId === person.id);
  const next = assignments[0];
  const nextBlock = day.blocks.find((block) => block.id === next?.blockId);
  return <div className="exec-app"><header className="exec-header"><button className="exec-brand" onClick={() => setSection("today")}><span>R</span> relay</button><div><button className="icon-button" aria-label="Notifications">•<span /></button><button className="exec-profile"><PersonAvatar person={person} /><span>{person.name}</span></button><button className="exit-preview" onClick={onExit}>Exit preview</button></div></header><main>
    {section === "today" && <><section className="exec-welcome"><div><span className="kicker">Good morning, {person.name}</span><h1>You’re making the day move.</h1><p>{day.date} · {data.venue}</p></div><DayToggle data={data} dayId={dayId} setDayId={setDayId} /></section>{next && nextBlock ? <section className="next-card"><div className="next-time"><span>NEXT UP</span><strong>{nextBlock.start}</strong><small>{nextBlock.end}</small></div><div className="next-main"><span className="role-label" style={{ background: next.color }}>{next.role}</span><h2>{nextBlock.label}</h2><p className="next-place">⌖ {nextBlock.location} <span>·</span> Lead: {next.lead}</p><p>{next.description}</p><div className="next-people"><span>With</span>{day.assignments.filter((a) => a.blockId === next.blockId && a.role === next.role && a.personId !== person.id).slice(0, 3).map((a) => <PersonAvatar key={a.id} small person={data.people.find((p) => p.id === a.personId)!} />)}</div></div><button className="acknowledge">✓ I’m ready</button></section> : null}<section className="my-day"><div className="subhead"><div><span className="kicker">Your itinerary</span><h3>{assignments.length} roles today</h3></div><button className="text-button">Whole event →</button></div><div className="itinerary">{assignments.map((assignment, index) => { const block = day.blocks.find((item) => item.id === assignment.blockId)!; return <article key={assignment.id} className={index === 0 ? "current" : ""}><div className="itinerary-time"><strong>{block.start}</strong><span>{block.end}</span></div><i style={{ background: assignment.color }} /><div><span>{block.label}</span><h4>{assignment.role}</h4><p>{block.location} · {assignment.lead}</p></div><button aria-label={`Open ${assignment.role}`}>→</button></article>; })}</div></section><section className="quick-links"><div className="subhead"><div><span className="kicker">In your pocket</span><h3>Important today</h3></div></div><div>{data.resources.slice(0, 4).map((resource) => <a href={resource.url} key={resource.id}><span>{resource.group.slice(0, 2).toUpperCase()}</span><strong>{resource.label}</strong><b>↗</b></a>)}</div></section></>}
    {section === "availability" && <section className="exec-availability"><span className="kicker">Your availability</span><h1>When can you be there?</h1><p>Tap each block to cycle between available, conditional, and unavailable. Directors will see your note alongside the grid.</p><DayToggle data={data} dayId={dayId} setDayId={setDayId} /><div className="exec-availability-list">{day.blocks.map((block) => { const status = person.availability[day.id]?.[block.id] ?? "available"; return <button className={status} key={block.id} onClick={() => onAvailability(person.id, block.id)}><div><strong>{block.start}</strong><span>{block.end}</span></div><div><h3>{block.label}</h3><p>{block.location}</p></div><b>{status === "available" ? "Available" : status === "conditional" ? "Conditional" : "Unavailable"}</b></button>; })}</div><label className="availability-note">Anything we should know?<textarea rows={4} defaultValue="Please avoid back-to-back physical roles after lunch if possible." /></label><button className="button primary full">Save availability</button></section>}
    {section === "directory" && <section className="exec-directory"><span className="kicker">Role directory</span><h1>Know what good looks like.</h1><p>These instructions are always tied to the published plan.</p><div className="directory-list">{Object.entries(roleDescriptions).map(([role, description]) => <details key={role}><summary><i style={{ background: roleColor(role) }} /><span>{role}</span><b>+</b></summary><p>{description}</p></details>)}</div></section>}
  </main><nav className="exec-nav" aria-label="Exec navigation">{(["today", "availability", "directory"] as ExecSection[]).map((item) => <button key={item} className={section === item ? "active" : ""} onClick={() => setSection(item)}><span>{item === "today" ? "◷" : item === "availability" ? "▦" : "≡"}</span>{item === "today" ? "My day" : item[0].toUpperCase() + item.slice(1)}</button>)}</nav></div>;
}
