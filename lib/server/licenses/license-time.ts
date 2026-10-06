import "server-only";

// Form date-times are local Europe/Stockholm wall time ("YYYY-MM-DDTHH:mm",
// optional ":ss") and are converted to one exact UTC instant. Times in the
// spring DST gap or the ambiguous autumn hour are rejected, never guessed.
const LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;
const STOCKHOLM_OFFSETS_MINUTES = [60, 120] as const;
const PARTS_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
  minute: "2-digit",
  month: "2-digit",
  second: "2-digit",
  timeZone: "Europe/Stockholm",
  year: "numeric",
});

function stockholmFields(epochMs: number): string {
  const parts = Object.fromEntries(
    PARTS_FORMATTER.formatToParts(new Date(epochMs)).map((part) => [
      part.type,
      part.value,
    ]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

/** UTC ISO instant for a Stockholm wall time, or null if invalid/ambiguous. */
export function stockholmLocalToUtc(value: string): string | null {
  const match = LOCAL_PATTERN.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1, 6).map(Number);
  const second = Number(match[6] ?? "0");
  if (year < 2000 || year > 9999) return null;
  const wallUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const expected = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6] ?? "00"}`;
  const candidates = STOCKHOLM_OFFSETS_MINUTES.map(
    (offset) => wallUtc - offset * 60_000,
  ).filter((epochMs) => stockholmFields(epochMs) === expected);
  if (candidates.length !== 1) return null;
  return new Date(candidates[0]).toISOString();
}
