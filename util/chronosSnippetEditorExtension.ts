import { App, Menu } from "obsidian";
import type { Range } from "@codemirror/state";
import {
	Decoration,
	DecorationSet,
	EditorView,
	keymap,
	ViewPlugin,
	ViewUpdate,
	WidgetType,
} from "@codemirror/view";

interface ChronosSnippet {
	label: string;
	value: string;
}

function getSnippets(): ChronosSnippet[] {
	const now = new Date();
	const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
	const year = String(now.getFullYear());
	const previousYear = Number(year) - 1;
	return [
		{ label: "Point", value: `* [${date}] Point title` },
		{
			label: "Point with description",
			value: `* [${date}] Point title | Description`,
		},
		{
			label: "Point with note link",
			value: `* [${date}] Point title | [[path/to/note]]`,
		},
		{
			label: "Point with group",
			value: `* [${date}] {Group name} Point title`,
		},
		{
			label: "Point with color",
			value: `* [${date}] #red Point title`,
		},
		{
			label: "Event (single date)",
			value: `- [${date}] Event title`,
		},
		{
			label: "Event (date range)",
			value: `- [${previousYear}~${year}] Event title`,
		},
		{
			label: "Event with description",
			value: `- [${date}] Event title | Description`,
		},
		{
			label: "Event with note link",
			value: `- [${date}] Event title | [[path/to/note]]`,
		},
		{
			label: "Event with color",
			value: `- [${date}] #blue Event title | Description`,
		},
		{
			label: "Event with group",
			value: `- [${date}] {Group name} Event title`,
		},
		{
			label: "Period",
			value: `@ [${previousYear}~${year}] Period title`,
		},
		{
			label: "Period with color",
			value: `@ [${previousYear}~${year}] #blue Period title`,
		},
		{ label: "Marker", value: `= [${date}] Marker title` },
		{ label: "Comment", value: "# Comment" },
	];
}

function getFlagSnippets(): ChronosSnippet[] {
	const year = new Date().getFullYear();
	return [
		{
			label: "DEFAULTVIEW - Set date range",
			value: `> DEFAULTVIEW ${year - 5}|${year + 5}`,
		},
		{
			label: "ORDERBY - Chronological order (no default stacking)",
			value: "> ORDERBY start",
		},
		{
			label: "ORDERBY - Start date descending",
			value: "> ORDERBY -start",
		},
		{
			label: "ORDERBY - Color, then start date",
			value: "> ORDERBY color|start",
		},
		{ label: "HEIGHT - Set timeline height (px)", value: "> HEIGHT 500" },
		{ label: "NOTODAY - Hide today line", value: "> NOTODAY" },
		{
			label: "NOSTACK - Prevent items from stacking",
			value: "> NOSTACK",
		},
	];
}

function findChronosFenceStart(view: EditorView): number | null {
	const currentLine = view.state.doc.lineAt(view.state.selection.main.head);
	for (let lineNumber = currentLine.number; lineNumber >= 1; lineNumber--) {
		const line = view.state.doc.line(lineNumber);
		const text = line.text.trim();
		if (!text.startsWith("```")) continue;
		return /^```chronos(?:\s|$)/i.test(text) ? line.to : null;
	}
	return null;
}

function isFenceLine(text: string): boolean {
	return /^ {0,3}(?:`{3,}|~{3,})/.test(text);
}

function isChronosFenceStart(text: string): boolean {
	return /^ {0,3}`{3,}\s*chronos(?:\s|$)/i.test(text);
}

function isInsideChronosFence(view: EditorView, lineNumber: number): boolean {
	for (let number = lineNumber - 1; number >= 1; number--) {
		const text = view.state.doc.line(number).text;
		if (!isFenceLine(text)) continue;
		return isChronosFenceStart(text);
	}
	return false;
}

function addTokenDecoration(
	decorations: Range<Decoration>[],
	from: number,
	to: number,
	className: string,
): void {
	if (from < to) {
		decorations.push(Decoration.mark({ class: className }).range(from, to));
	}
}

function buildLineHighlightDecorations(
	line: { from: number; text: string },
	decorations: Range<Decoration>[],
): void {
	const text = line.text;
	const comment = /^\s*#/.exec(text);
	if (comment) {
		addTokenDecoration(
			decorations,
			line.from + comment.index,
			line.from + text.length,
			"cm-chronos-comment",
		);
		return;
	}

	const flag = /^(\s*>\s*)([A-Za-z]+)\b/.exec(text);
	if (flag) {
		const commandStart = flag[1].length;
		addTokenDecoration(
			decorations,
			line.from + text.indexOf(">"),
			line.from + text.indexOf(">") + 1,
			"cm-chronos-directive",
		);
		addTokenDecoration(
			decorations,
			line.from + commandStart,
			line.from + commandStart + flag[2].length,
			"cm-chronos-flag",
		);
		return;
	}

	const marker = /^\s*([-*@=])(?=\s|$)/.exec(text);
	if (marker) {
		const markerStart = marker.index + marker[0].indexOf(marker[1]);
		addTokenDecoration(
			decorations,
			line.from + markerStart,
			line.from + markerStart + 1,
			"cm-chronos-marker",
		);
	}

	const tokenPattern = /\[\[[^\]]+\]\]|\[[^\]]+\]|\{[^}]*\}|#[\w-]+|\|/g;
	let match: RegExpExecArray | null;
	while ((match = tokenPattern.exec(text)) !== null) {
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
		addTokenDecoration(
			decorations,
			line.from + match.index,
			line.from + match.index + token.length,
			className,
		);
	}
}

function insertSnippet(view: EditorView, snippet: string): void {
	const position = view.state.selection.main.head;
	const line = view.state.doc.lineAt(position);
	const prefix = position > line.from ? "\n" : "";
	const suffix = position < line.to ? "\n" : "";
	const text = `${prefix}${snippet}${suffix}`;
	const cursor = position + text.length;
	view.dispatch({
		changes: { from: position, insert: text },
		selection: { anchor: cursor },
	});
	view.focus();
}

function showSnippetMenu(
	view: EditorView,
	position: { x: number; y: number } | MouseEvent,
): void {
	const menu = new Menu();
	menu.addItem((item) => item.setTitle("Items").setIsLabel(true));
	getSnippets().forEach((snippet) => {
		menu.addItem((item) =>
			item
				.setTitle(snippet.label)
				.onClick(() => insertSnippet(view, snippet.value)),
		);
	});
	menu.addSeparator();
	menu.addItem((item) => item.setTitle("Options").setIsLabel(true));
	getFlagSnippets().forEach((snippet) => {
		menu.addItem((item) =>
			item
				.setTitle(snippet.label)
				.onClick(() => insertSnippet(view, snippet.value)),
		);
	});
	if (position instanceof MouseEvent) {
		menu.showAtMouseEvent(position);
	} else {
		menu.showAtPosition(position);
	}
}

class ChronosSnippetButton extends WidgetType {
	constructor(private app: App) {
		super();
	}

	toDOM(view: EditorView): HTMLElement {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "chronos-snippet-menu-button";
		button.textContent = "Insert snippet";
		button.setAttribute("aria-label", "Insert a Chronos snippet");
		button.setAttribute("aria-haspopup", "menu");
		button.setAttribute(
			"aria-keyshortcuts",
			"Control+Shift+Enter Meta+Shift+Enter",
		);
		button.title = "Insert a Chronos snippet (Mod+Shift+Enter)";
		button.addEventListener("mousedown", (event) => event.preventDefault());
		button.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			if (event.detail === 0) {
				const bounds = button.getBoundingClientRect();
				showSnippetMenu(view, { x: bounds.left, y: bounds.bottom });
			} else {
				showSnippetMenu(view, event);
			}
		});
		return button;
	}

	ignoreEvent(): boolean {
		return true;
	}

	eq(other: WidgetType): boolean {
		return other instanceof ChronosSnippetButton;
	}
}

export function createChronosSnippetEditorExtension(app: App) {
	const widget = new ChronosSnippetButton(app);
	const chronosWidget = ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = this.buildDecorations(view);
			}

			update(update: ViewUpdate): void {
				if (
					update.docChanged ||
					update.selectionSet ||
					update.viewportChanged
				) {
					this.decorations = this.buildDecorations(update.view);
				}
			}

			private buildDecorations(view: EditorView): DecorationSet {
				const decorations: Range<Decoration>[] = [];
				const position = findChronosFenceStart(view);
				if (position !== null) {
					decorations.push(
						Decoration.widget({ widget, side: 1 }).range(position),
					);
				}

				for (const visibleRange of view.visibleRanges) {
					const firstLine = view.state.doc.lineAt(visibleRange.from).number;
					const lastLine = view.state.doc.lineAt(visibleRange.to).number;
					let insideChronos = isInsideChronosFence(view, firstLine);

					for (
						let lineNumber = firstLine;
						lineNumber <= lastLine;
						lineNumber++
					) {
						const line = view.state.doc.line(lineNumber);
						if (isChronosFenceStart(line.text)) {
							insideChronos = true;
							continue;
						}
						if (isFenceLine(line.text)) {
							insideChronos = false;
							continue;
						}
						if (insideChronos) {
							buildLineHighlightDecorations(line, decorations);
						}
					}
				}

				return decorations.length
					? Decoration.set(decorations, true)
					: Decoration.none;
			}
		},
		{ decorations: (plugin) => plugin.decorations },
	);
	// Keyboard users can open the menu with Mod+Shift+Enter inside a Chronos fence; Tab stays available for indentation.
	const snippetShortcut = keymap.of([
		{
			key: "Mod-Shift-Enter",
			run(view) {
				if (findChronosFenceStart(view) === null) return false;
				const cursor = view.coordsAtPos(view.state.selection.main.head);
				if (!cursor) return false;
				showSnippetMenu(view, { x: cursor.left, y: cursor.bottom });
				return true;
			},
		},
	]);
	return [chronosWidget, snippetShortcut];
}
