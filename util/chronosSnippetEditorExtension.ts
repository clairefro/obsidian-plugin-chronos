import { App, Menu } from "obsidian";
import {
	Decoration,
	DecorationSet,
	EditorView,
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
		{ label: "Point", value: `* [${date}] Point title` },
		{ label: "Marker", value: `= [${date}] Marker title` },
		{ label: "Comment", value: "# Comment" },
	];
}

function getFlagSnippets(): ChronosSnippet[] {
	const year = new Date().getFullYear();
	return [
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
		{
			label: "DEFAULTVIEW - Set date range",
			value: `> DEFAULTVIEW ${year - 5}|${year + 5}`,
		},
		{ label: "NOTODAY - Hide today line", value: "> NOTODAY" },
		{ label: "HEIGHT - Set timeline height (px)", value: "> HEIGHT 500" },
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
		button.addEventListener("mousedown", (event) => event.preventDefault());
		button.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
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
			menu.showAtMouseEvent(event);
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
	return ViewPlugin.fromClass(
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
				const position = findChronosFenceStart(view);
				if (position === null) return Decoration.none;
				return Decoration.set([
					Decoration.widget({ widget, side: 1 }).range(position),
				]);
			}
		},
		{ decorations: (plugin) => plugin.decorations },
	);
}
