export type ParsedScheduleBlock = {
  start: string;
  end: string;
  label: string;
  location: string;
};

type ParsedRow = {
  start: string;
  explicitEnd: string;
  events: string[];
  location: string;
};

const timeToken = String.raw`\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?`;
const singleTime = new RegExp(`^(${timeToken})$`, "i");
const timeRange = new RegExp(`^(${timeToken})\s*(?:-|–|—|to)\s*(${timeToken})$`, "i");
const inlineRange = new RegExp(`^(${timeToken})\s*(?:-|–|—|to)\s*(${timeToken})\s+(.+)$`, "i");

function cleanCell(value: string) {
  let cleaned = value.trim();
  for (const marker of ["**", "__", "`"] as const) {
    if (cleaned.startsWith(marker) && cleaned.endsWith(marker) && cleaned.length > marker.length * 2) {
      cleaned = cleaned.slice(marker.length, -marker.length).trim();
    }
  }
  return cleaned;
}

function cleanTime(value: string) {
  return value.trim().replace(/\s+/g, " ").replace(/a\.?m\.?$/i, "AM").replace(/p\.?m\.?$/i, "PM");
}

function fallbackEnd(start: string) {
  const match = cleanTime(start).match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return start;
  const hasMeridiem = Boolean(match[3]);
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  if (hasMeridiem) {
    if (hour === 12) hour = 0;
    if (match[3].toUpperCase() === "PM") hour += 12;
  }
  const total = hour * 60 + minute + 30;
  const nextHour = Math.floor(total / 60) % 24;
  const nextMinute = total % 60;
  if (!hasMeridiem) return `${String(nextHour).padStart(2, "0")}:${String(nextMinute).padStart(2, "0")}`;
  const suffix = nextHour >= 12 ? "PM" : "AM";
  const displayHour = nextHour % 12 || 12;
  return `${displayHour}:${String(nextMinute).padStart(2, "0")} ${suffix}`;
}

function parseRow(line: string): ParsedRow | null {
  const columns = line.includes("\t") || line.includes("|")
    ? line.split(/\t|\|/).map(cleanCell)
    : [cleanCell(line)];
  if (!columns.some(Boolean) || /^time$/i.test(columns[0] ?? "")) return null;

  const range = (columns[0] ?? "").match(timeRange);
  if (range) {
    const label = columns[1]?.trim();
    if (!label) return null;
    return { start: cleanTime(range[1]), explicitEnd: cleanTime(range[2]), events: [label], location: columns[2]?.trim() ?? "" };
  }

  const inline = cleanCell(line).match(inlineRange);
  if (columns.length === 1 && inline) {
    return { start: cleanTime(inline[1]), explicitEnd: cleanTime(inline[2]), events: [inline[3].trim()], location: "" };
  }

  const start = (columns[0] ?? "").match(singleTime);
  if (!start) return null;
  const events = columns.slice(1).map((value) => value.trim()).filter(Boolean);
  if (!events.length) return null;
  return { start: cleanTime(start[1]), explicitEnd: "", events, location: "" };
}

function parseRows(text: string): ParsedRow[] {
  const rows: ParsedRow[] = [];
  let pending: ParsedRow | null = null;
  const flushPending = () => {
    if (pending) rows.push(pending);
    pending = null;
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = cleanCell(rawLine);
    if (!line || /^(?:time|event)$/i.test(line)) continue;

    if (rawLine.includes("\t") || rawLine.includes("|") || inlineRange.test(line)) {
      const row = parseRow(rawLine);
      if (row) {
        flushPending();
        rows.push(row);
      }
      continue;
    }

    const start = line.match(singleTime);
    if (start) {
      flushPending();
      pending = { start: cleanTime(start[1]), explicitEnd: "", events: [], location: "" };
      continue;
    }

    if (pending) pending.events.push(line);
  }

  flushPending();
  return rows;
}

export function parseScheduleTable(text: string): ParsedScheduleBlock[] {
  const rows = parseRows(text);
  return rows.flatMap((row, rowIndex) => {
    const end = row.explicitEnd || rows[rowIndex + 1]?.start || fallbackEnd(row.start);
    return row.events
      .filter((label) => !/^(?:end|event ends?|end of event)$/i.test(label.trim()))
      .map((label) => ({ start: row.start, end, label, location: row.location }));
  });
}
