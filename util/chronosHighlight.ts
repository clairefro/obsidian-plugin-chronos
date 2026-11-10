export interface ChronosHighlight {
	from: number;
	to: number;
	className: string;
}

export function getChronosLineHighlights(text: string): ChronosHighlight[] {
	const highlights: ChronosHighlight[] = [];
	const add = (from: number, to: number, className: string) => {
		if (from < to) highlights.push({ from, to, className });
	};
	if (/^\s*#/.test(text)) {
		add(0, text.length, "cm-chronos-comment");
		return highlights;
	}
	const flag = /^(\s*>\s*)([A-Za-z]+)\b/.exec(text);
	if (flag) {
		add(text.indexOf(">"), text.indexOf(">") + 1, "cm-chronos-directive");
		add(flag[1].length, flag[1].length + flag[2].length, "cm-chronos-flag");
		return highlights;
	}
	const marker = /^\s*([-*@=])(?=\s|$)/.exec(text);
	if (marker) {
		const start = marker[0].indexOf(marker[1]);
		add(start, start + 1, "cm-chronos-item-marker");
	}
	const separator = text.indexOf("|");
	if (separator !== -1) {
		add(separator + 1, text.length, "cm-chronos-description");
	}
	const pattern = /\[\[[^\]]+\]\]|\[[^\]]+\]|\{[^}]*\}|#[\w-]+|\|/g;
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(text)) !== null) {
		const token = match[0];
		const className = token.startsWith("[[")
			? "cm-chronos-link"
			: token.startsWith("[")
				? "cm-chronos-date"
				: token.startsWith("{")
					? "cm-chronos-group"
					: token.startsWith("#")
						? "cm-chronos-color"
						: "cm-chronos-separator";
		add(match.index, match.index + token.length, className);
		if (className === "cm-chronos-date") {
			const index = token.indexOf("~");
			if (index !== -1) {
				add(
					match.index + index,
					match.index + index + 1,
					"cm-chronos-date-range-separator",
				);
			}
		}
	}
	return highlights;
}

export function renderHighlightedChronos(
	container: HTMLElement,
	markdown: string,
): void {
	container.empty();
	const lines = markdown.split("\n");
	for (const [lineIndex, line] of lines.entries()) {
		const highlights = getChronosLineHighlights(line);
		const boundaries = [
			...new Set([
				0,
				line.length,
				...highlights.flatMap((h) => [h.from, h.to]),
			]),
		].sort((a, b) => a - b);
		for (let i = 0; i + 1 < boundaries.length; i++) {
			const from = boundaries[i];
			const to = boundaries[i + 1];
			const cls = highlights
				.filter((h) => h.from <= from && h.to >= to)
				.map((h) => h.className)
				.join(" ");
			container.createSpan({ cls, text: line.slice(from, to) });
		}
		if (lineIndex < lines.length - 1) container.appendText("\n");
	}
}
