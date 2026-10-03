import type { Collector } from "../diagnostics.js";
import type { Inspection } from "../types.js";
import { children, text } from "../xml.js";
import type { XmlNode } from "../xml.js";
import {
  formatLocalDateTime,
  isValidDateTime,
  type DateOptions,
  type DateTimeParts,
} from "./dates.js";

const MAX_YEAR = 9999;

const MONTHS: ReadonlyMap<string, number> = new Map(
  ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].map(
    (name, index) => [name, index + 1],
  ),
);

// 17-Oct-2026 10:00am to 10:30am, and the start-only form. Minutes are optional.
const DAY_MONTH_YEAR =
  /^(\d{1,2})-([a-z]{3})-(\d{4})\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)(?:\s+to\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm))?$/i;

// 2026-10-17 10:00 to 10:30, and the start-only form.
const ISO = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?:\s+to\s+(\d{2}):(\d{2}))?$/i;

type Clock = { hour: number; minute: number };

/** A 12-hour reading to a 24-hour one, or null when the hour is not 1 to 12. 12am is 0. */
function fromTwelveHour(hour: string, minute: string | undefined, meridiem: string): Clock | null {
  const h = Number(hour);
  if (h < 1 || h > 12) return null;
  const pm = meridiem.toLowerCase() === "pm";
  return { hour: (h % 12) + (pm ? 12 : 0), minute: Number(minute ?? "0") };
}

function fromTwentyFourHour(hour: string, minute: string): Clock {
  return { hour: Number(hour), minute: Number(minute) };
}

type Parsed = {
  date: { year: number; month: number; day: number };
  start: Clock;
  end: Clock | null;
};

function matchDayMonthYear(raw: string): Parsed | null {
  const m = DAY_MONTH_YEAR.exec(raw);
  if (m === null) return null;
  const month = MONTHS.get((m[2] ?? "").toLowerCase());
  const start = fromTwelveHour(m[4] ?? "", m[5], m[6] ?? "");
  if (month === undefined || start === null) return null;

  let end: Clock | null = null;
  if (m[7] !== undefined) {
    end = fromTwelveHour(m[7], m[8], m[9] ?? "");
    if (end === null) return null;
  }
  return { date: { year: Number(m[3]), month, day: Number(m[1]) }, start, end };
}

function matchIso(raw: string): Parsed | null {
  const m = ISO.exec(raw);
  if (m === null) return null;
  const start = fromTwentyFourHour(m[4] ?? "", m[5] ?? "");
  const end = m[6] === undefined ? null : fromTwentyFourHour(m[6], m[7] ?? "");
  return { date: { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }, start, end };
}

function parts(date: Parsed["date"], clock: Clock): DateTimeParts {
  return { ...date, hour: clock.hour, minute: clock.minute, second: 0 };
}

/** The calendar day after a date, or null when it would pass year 9999. */
function nextDay(date: Parsed["date"]): Parsed["date"] | null {
  const moved = new Date(0);
  moved.setUTCFullYear(date.year, date.month - 1, date.day + 1);
  const year = moved.getUTCFullYear();
  if (year > MAX_YEAR) return null;
  return { year, month: moved.getUTCMonth() + 1, day: moved.getUTCDate() };
}

function toInspection(parsed: Parsed, raw: string, o: DateOptions): Inspection | null {
  const startParts = parts(parsed.date, parsed.start);
  if (!isValidDateTime(startParts)) return null;
  if (parsed.end !== null && !isValidDateTime(parts(parsed.date, parsed.end))) return null;

  let end: string | null = null;
  if (parsed.end !== null) {
    // An end earlier than the start (11:30pm to 12:30am) belongs to the next day.
    const earlier =
      parsed.end.hour * 60 + parsed.end.minute < parsed.start.hour * 60 + parsed.start.minute;
    const endDate = earlier ? nextDay(parsed.date) : parsed.date;
    if (endDate !== null) end = formatLocalDateTime(parts(endDate, parsed.end), o);
  }
  return { start: formatLocalDateTime(startParts, o), end, raw };
}

/**
 * Reads `inspectionTimes/inspection` text from a listing element. Accepted forms, with flexible
 * whitespace and any case:
 *
 * - `DD-Mon-YYYY h[:mm]am|pm to h[:mm]am|pm`
 * - `DD-Mon-YYYY h[:mm]am|pm`
 * - `YYYY-MM-DD HH:mm to HH:mm`
 * - `YYYY-MM-DD HH:mm`
 *
 * 12:00pm is noon and 12:15am is 00:15. An end earlier than the start rolls to the next day.
 * Times are local and are converted like every other date, so with `timeZone` they become UTC
 * with a trailing Z. `raw` is the trimmed original text. Empty elements are ignored silently.
 * Text that matches no form, or names a date or time that does not exist, adds
 * `unparseable-inspection`, and the inspection is omitted. The diagnostic carries the text
 * after the shared detail sanitising, which caps it at 80 characters.
 *
 * @throws RangeError when `o.timeZone` is not a valid IANA zone name and an inspection is read.
 */
export function parseInspections(listing: XmlNode, c: Collector, o: DateOptions): Inspection[] {
  const out: Inspection[] = [];
  for (const container of children(listing, "inspectionTimes")) {
    for (const node of children(container, "inspection")) {
      const raw = text(node);
      if (raw === null) continue;
      const parsed = matchDayMonthYear(raw) ?? matchIso(raw);
      const inspection = parsed === null ? null : toInspection(parsed, raw, o);
      if (inspection === null) c.add("unparseable-inspection", node.path, raw);
      else out.push(inspection);
    }
  }
  return out;
}
