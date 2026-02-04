import { BasesView, BasesQueryResult, QueryController } from "obsidian";
import { ChronosTimeline } from "chronos-timeline-md";
import { ChronosPluginSettings } from "../types";

export class ChronosTimelineBasesView extends BasesView {
	// This unique ID is what appears in the "Add View" menu
	static VIEW_TYPE = "chronos-timeline-bases-view";
	type: string = ChronosTimelineBasesView.VIEW_TYPE;
	private containerEl: HTMLElement;
	private pluginSettings: ChronosPluginSettings;

	constructor(
		controller: QueryController,
		parentEl: HTMLElement,
		pluginSettings: ChronosPluginSettings,
	) {
		super(controller);
		this.containerEl = parentEl.createDiv("bases-example-view-container");
		this.pluginSettings = pluginSettings;
	}

	public onDataUpdated(): void {
		console.log("[CHRONOS BASES] updated");

		const result: BasesQueryResult = this.data;
		// TODO: HANDLE EMPTY RESULT SETS
		if (!result || !result.data) return;

		console.log("settings: ", this.pluginSettings);

		const entries = this.data.data; // Array of BasesEntry

		const items = entries.map((entry) => {
			const start = (entry.getValue("note.start") as any)?.data;
			const end = (entry.getValue("note.end") as any)?.data || undefined;
			const content =
				(entry.getValue("note.content") as any)?.data ||
				(entry.getValue("file.name") as any)?.data ||
				"Untitled";
			const color =
				(entry.getValue("note.color") as any)?.data || undefined;
			const type =
				(entry.getValue("note.type") as any)?.data || undefined;
			const description =
				(entry.getValue("note.description") as any)?.data || undefined;
			return normalizeItemFields({
				start,
				end,
				content,
				color,
				type,
				description,
			});
		});

		console.log({ items });

		// TODO: helper for converting data to chronos string
		const chronosMarkdown = chronosItemsToMarkdown(items);

		// Join events into Chronos syntax
		console.log({ chronosMarkdown });

		this.containerEl.empty();

		const timeline = new ChronosTimeline({
			container: this.containerEl,
			settings: this.pluginSettings || {},
		});
		timeline.render(chronosMarkdown);
	}
}

/** --- HELPERS ---- */

// Convert item object to Chronos markdown string
function chronosItemsToMarkdown(
	items: {
		start: string;
		end?: string;
		content?: string;
		color?: string;
		type?: string;
		description?: string;
	}[],
): string {
	// TODO: HANDLE EDGE CASES + TRIMMING
	const lines = [];
	for (const item of items) {
		const { start, end, content, color, type, description } = item;

		// skip items without start
		if (!start) continue;

		// Format: <type> [start~end] content | "description"

		const TYPES: { [key: string]: string } = {
			event: "-",
			period: "@",
			point: "*",
			marker: "=",
		};

		// default to event if no type present
		let line = `${type && TYPES[type] ? TYPES[type] : "-"} [${start}`;
		if (end) line += `~${end}`;
		line += "]";
		if (color) line += ` #${color} `;
		if (content) line += ` ${content}`;
		if (description) line += ` |${description}`;
		lines.push(line);
	}
	return lines.join("\n");
}

// enforce strings for non-undefined vals; trim whitespace
function normalizeItemFields(event: {
	start: any;
	end?: any;
	content?: any;
	color?: any;
	type?: any;
	description?: any;
}): {
	start: string;
	end?: string;
	content?: string;
	color?: string;
	type?: string;
	description?: string;
} {
	return {
		start: event.start !== undefined ? String(event.start).trim() : "",
		end: event.end !== undefined ? String(event.end).trim() : undefined,
		content:
			event.content !== undefined
				? String(event.content).trim()
				: undefined,
		color:
			event.color !== undefined ? String(event.color).trim() : undefined,
		type: event.type !== undefined ? String(event.type).trim() : undefined,
		description:
			event.description !== undefined
				? String(event.description).trim()
				: undefined,
	};
}
