import * as ChronosLib from "chronos-timeline-md";

export type DateField = "start" | "end";

const MONTHS = [
	"jan",
	"feb",
	"mar",
	"apr",
	"may",
	"jun",
	"jul",
	"aug",
	"sep",
	"oct",
	"nov",
	"dec",
];

const pad = (n: string | number, len = 2) => String(n).padStart(len, "0");

// Parses a trailing time like "12:00", "12:00:30", "12:00:30.123Z", "12:00+02:00".
// Zone suffixes and fractions are dropped: Chronos has no offset syntax.
function normalizeTime(raw: string): string | undefined {
	if (!raw) return "";
	const m = raw
		.trim()
		.match(
			/^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(?:Z|[+-]\d{2}:?\d{2})?$/i,
		);
	if (!m) return undefined;
	return `T${pad(m[1])}:${m[2]}${m[3] ? ":" + m[3] : ""}`;
}

/**
 * Converts common date formats to the YYYY-MM-DD[THH:mm[:ss]] form Chronos
 * expects. Anything unrecognised (or ambiguous, like 03/04/2026) is returned
 * unchanged so validation can report it.
 *
 *   2026/10/14, 2026.10.14, 2026-1-4, 2026-10-14 12:00, 2026-10-14T12:00:00.000Z
 *   14/10/2026 and 10/14/2026 (only when day vs month is unambiguous)
 *   Oct 14, 2026 / 14 Oct 2026 / October 14 2026
 */
export function normalizeDateValue(value: string): string {
	let v = value.trim();
	const ongoing = v.endsWith("~");
	if (ongoing) v = v.slice(0, -1).trim();

	// split into date part and optional time part
	const [datePart, ...rest] = v.split(/[T\s]+/);
	let datePartFull = datePart;
	let timeRaw = rest.join(" ");

	// "Oct 14, 2026 12:00" style: month names contain spaces, so match whole string first
	const named =
		v.match(
			/^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})(?:\s+(.+))?$/,
		) ||
		v.match(
			/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})(?:\s+(.+))?$/,
		);
	let y: string | undefined, mo: string | undefined, d: string | undefined;

	if (named) {
		const nameFirst = /^[A-Za-z]/.test(named[1]);
		const monthName = (nameFirst ? named[1] : named[2])
			.slice(0, 3)
			.toLowerCase();
		const idx = MONTHS.indexOf(monthName);
		if (idx >= 0) {
			mo = String(idx + 1);
			d = nameFirst ? named[2] : named[1];
			y = named[3];
			timeRaw = named[4] ?? "";
		}
	}

	if (!y) {
		let m = datePartFull.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
		if (m) {
			[, y, mo, d] = m;
		} else if (
			(m = datePartFull.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))
		) {
			const a = Number(m[1]);
			const b = Number(m[2]);
			if (a > 12 && b <= 12) [d, mo, y] = [m[1], m[2], m[3]];
			else if (b > 12 && a <= 12) [mo, d, y] = [m[1], m[2], m[3]];
		}
	}

	if (!y || !mo || !d) return value.trim();
	const time = normalizeTime(timeRaw);
	if (time === undefined) return value.trim();
	return `${pad(y, 4)}-${pad(mo)}-${pad(d)}${time}${ongoing ? "~" : ""}`;
}

function isValidChronosLine(line: string): boolean {
	try {
		ChronosLib.parseChronos(line);
		return true;
	} catch {
		return false;
	}
}

/**
 * Checks start/end values with Chronos' own parser, so Bases accepts exactly
 * what a chronos code block accepts. Returns the fields that are invalid
 * (both, if each is fine alone but the range is not, e.g. end before start).
 */
export function findInvalidDateFields(
	start: string,
	end?: string,
): DateField[] {
	const invalid: DateField[] = [];
	if (!isValidChronosLine(`* [${start}] x`)) invalid.push("start");
	if (end && !isValidChronosLine(`* [${end}] x`)) invalid.push("end");
	if (
		invalid.length === 0 &&
		end &&
		!isValidChronosLine(`- [${start}~${end}] x`)
	) {
		invalid.push("start", "end");
	}
	return invalid;
}
