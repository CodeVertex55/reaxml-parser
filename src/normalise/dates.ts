import type { Collector } from "../diagnostics.js";

export type DateOptions = {
  /** IANA zone name such as "Australia/Sydney". When set, date-times are converted to UTC. */
  timeZone?: string;
};

const DATE_TIME_PATTERNS: readonly RegExp[] = [
  // YYYY-MM-DD-hh:mm:ss, YYYY-MM-DD-hh:mm, YYYY-MM-DDThh:mm:ss, YYYY-MM-DD hh:mm:ss
  /^(\d{4})-(\d{2})-(\d{2})[-T ](\d{2}):(\d{2})(?::(\d{2}))?$/,
  // YYYYMMDD-hhmmss and YYYYMMDDhhmmss
  /^(\d{4})(\d{2})(\d{2})-?(\d{2})(\d{2})(\d{2})$/,
];

const DATE_ONLY_PATTERNS: readonly RegExp[] = [
  /^(\d{4})-(\d{2})-(\d{2})$/, // YYYY-MM-DD
  /^(\d{4})(\d{2})(\d{2})$/, // YYYYMMDD
];

const DAY_MS = 86_400_000;

/** Longest raw value echoed into an invalid-date diagnostic. */
const MAX_DETAIL = 40;

const formatters = new Map<string, Intl.DateTimeFormat>();

/** One cached formatter per zone. Throws RangeError for a zone name Intl does not know. */
function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

type Fields = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

/** Milliseconds since the epoch of these fields read as UTC. Safe for years below 100. */
function utcMs(f: Fields): number {
  const date = new Date(0);
  date.setUTCFullYear(f.year, f.month - 1, f.day);
  date.setUTCHours(f.hour, f.minute, f.second, 0);
  return date.getTime();
}

/** The zone's offset from UTC in milliseconds at an instant, from its wall clock reading. */
function offsetAt(formatter: Intl.DateTimeFormat, instant: number): number {
  const read: Record<string, number> = {};
  for (const part of formatter.formatToParts(new Date(instant))) {
    if (part.type !== "literal") read[part.type] = Number(part.value);
  }
  const wall = utcMs({
    year: read["year"] ?? 0,
    month: read["month"] ?? 1,
    day: read["day"] ?? 1,
    hour: (read["hour"] ?? 0) % 24,
    minute: read["minute"] ?? 0,
    second: read["second"] ?? 0,
  });
  return wall - instant;
}

/**
 * The UTC instant for a wall clock reading in a zone. Offsets are sampled a day either side of
 * the reading, which brackets any single transition. A candidate instant is valid when the zone
 * really shows that offset then. A reading that happens twice (clocks going back) has two valid
 * candidates and a reading that never happens (clocks going forward) has none; in both cases
 * the earlier instant is returned.
 */
function zonedToUtc(formatter: Intl.DateTimeFormat, f: Fields): number {
  const wall = utcMs(f);
  const offsets = new Set([offsetAt(formatter, wall - DAY_MS), offsetAt(formatter, wall + DAY_MS)]);
  const candidates = [...offsets].map((offset) => ({ offset, instant: wall - offset }));
  const valid = candidates.filter((c) => offsetAt(formatter, c.instant) === c.offset);
  const pool = valid.length > 0 ? valid : candidates;
  return Math.min(...pool.map((c) => c.instant));
}

function toUtcString(instant: number): string {
  const d = new Date(instant);
  return (
    `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}` +
    `T${pad(d.getUTCHours(), 2)}:${pad(d.getUTCMinutes(), 2)}:${pad(d.getUTCSeconds(), 2)}Z`
  );
}

function invalid(raw: string, path: string, c: Collector): null {
  c.add("invalid-date", path, raw.slice(0, MAX_DETAIL));
  return null;
}

/**
 * Normalises a REAXML date. Date-times become local `YYYY-MM-DDThh:mm:ss` and date-only values
 * become `YYYY-MM-DD`. With `opts.timeZone`, date-times become UTC `YYYY-MM-DDThh:mm:ssZ`
 * and date-only values stay as they are. A wall time that does not exist in the zone, or that
 * occurs twice, resolves to the earlier UTC instant.
 *
 * Null, empty and blank input give null with no diagnostic. Unparseable and zero dates give
 * null and an `invalid-date` diagnostic.
 *
 * @throws RangeError when `opts.timeZone` is not a valid IANA zone name. This is raised on every
 * call with a zone set, so callers can validate a zone by calling once.
 */
export function parseDate(
  value: string | null,
  path: string,
  c: Collector,
  opts: DateOptions,
): string | null {
  const formatter = opts.timeZone === undefined ? null : formatterFor(opts.timeZone);

  const raw = value?.trim() ?? "";
  if (raw === "") return null;

  let groups: RegExpExecArray | null = null;
  let hasTime = true;
  for (const pattern of DATE_TIME_PATTERNS) {
    groups = pattern.exec(raw);
    if (groups !== null) break;
  }
  if (groups === null) {
    hasTime = false;
    for (const pattern of DATE_ONLY_PATTERNS) {
      groups = pattern.exec(raw);
      if (groups !== null) break;
    }
  }
  if (groups === null) return invalid(raw, path, c);

  const number = (index: number): number => Number(groups?.[index] ?? "0");
  const fields: Fields = {
    year: number(1),
    month: number(2),
    day: number(3),
    hour: hasTime ? number(4) : 0,
    minute: hasTime ? number(5) : 0,
    second: hasTime ? number(6) : 0,
  };

  const ok =
    fields.year >= 1 &&
    fields.month >= 1 &&
    fields.month <= 12 &&
    fields.day >= 1 &&
    fields.day <= daysInMonth(fields.year, fields.month) &&
    fields.hour <= 23 &&
    fields.minute <= 59 &&
    fields.second <= 59;
  if (!ok) return invalid(raw, path, c);

  const datePart = `${pad(fields.year, 4)}-${pad(fields.month, 2)}-${pad(fields.day, 2)}`;
  if (!hasTime) return datePart;

  if (formatter !== null) return toUtcString(zonedToUtc(formatter, fields));
  return `${datePart}T${pad(fields.hour, 2)}:${pad(fields.minute, 2)}:${pad(fields.second, 2)}`;
}
