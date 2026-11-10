import { diffArrays } from "diff";

export function createEditableDiff(before: string, after: string): string {
	const oldLines = before.split("\n");
	const newLines = after.split("\n");
	const changes = diffArrays(oldLines, newLines, { timeout: 1000 }) ?? [
		{ value: oldLines, removed: true, added: false },
		{ value: newLines, added: true, removed: false },
	];
	return changes
		.flatMap((change) => {
			const prefix = change.added ? "+ " : change.removed ? "- " : "  ";
			return change.value.map((line) => prefix + line);
		})
		.join("\n");
}
