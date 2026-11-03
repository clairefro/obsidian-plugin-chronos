import * as ChronosLib from "chronos-timeline-md";

export type DateField = "start" | "end";

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
