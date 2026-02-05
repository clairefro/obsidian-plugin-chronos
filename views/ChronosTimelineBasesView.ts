import {
	BasesView,
	setIcon,
	setTooltip,
	QueryController,
	Notice,
} from "obsidian";

import { ChronosPluginSettings } from "../types";
import { CHRONOS_PLAYGROUND_BASE_URL } from "../constants";
import LZString from "lz-string";
import * as ChronosLib from "chronos-timeline-md";
const ChronosTimeline: any =
	(ChronosLib as any).ChronosTimeline ??
	(ChronosLib as any).default ??
	(ChronosLib as any);
import { FileUtils } from "../util/FileUtils";
import { wireSharedTimelineInteractions } from "../util/wireSharedTimelineInteractions";

export class ChronosTimelineBasesView extends BasesView {
	// This unique ID is what appears in the "Add View" menu
	static VIEW_TYPE = "chronos-timeline-bases-view";
	type: string = ChronosTimelineBasesView.VIEW_TYPE;
	private containerEl: HTMLElement;
	private pluginSettings: ChronosPluginSettings;
	private chronosMarkdown: string = "";
	private fileUtils: FileUtils;

	constructor(
		controller: QueryController,
		parentEl: HTMLElement,
		pluginSettings: ChronosPluginSettings,
	) {
		super(controller);
		this.containerEl = parentEl.createDiv("chronos-bases-view-container");
		this.pluginSettings = pluginSettings;
		// FileUtils instance for note linking
		this.fileUtils = new FileUtils({ app: this.app });
	}

	public onDataUpdated(): void {
		// refresh state
		this.chronosMarkdown = "";
		this.containerEl.empty();

		// conditionally add styling for sidebar presentation
		const isSidebar = this.containerEl.closest(
			".mod-right-split, .mod-left-split",
		);
		if (isSidebar) {
			this.containerEl.addClass("chronos-sidebar");
		} else {
			this.containerEl.removeClass("chronos-sidebar");
		}

		// show helpful message if results are empty
		if (!this.data || !this.data.data || this.data.data.length === 0) {
			this.renderInstructionsOnEmptyResults();
		}

		const entries = this.data.data; // BasesEntry[]

		const items = entries.map((entry) => {
			const start =
				entry.getValue("note.start")?.toString() !== "null"
					? entry.getValue("note.start")?.toString()
					: undefined;
			const end =
				entry.getValue("note.end")?.toString() !== "null"
					? entry.getValue("note.end")?.toString()
					: undefined;
			// content defaults to filename unless overriden by note.content
			const content =
				(entry.getValue("note.content") as any)?.data ||
				(entry.getValue("file.name") as any)?.data ||
				"Untitled";
			const color =
				(entry.getValue("note.color") as any)?.data || undefined;
			const type =
				(entry.getValue("note.type") as any)?.data || undefined;
			const fileName =
				(entry.getValue("file.name") as any)?.data || "Untitled";
			const descriptionRaw =
				(entry.getValue("note.description") as any)?.data || undefined;
			/** automatically postpend a wikilink to this note so users can click to open */
			const description = `${descriptionRaw ? descriptionRaw + " " : ""}[[${fileName}]]`;
			return normalizeItemFields({
				start,
				end,
				content,
				color,
				type,
				description,
			});
		});

		this.chronosMarkdown = chronosItemsToMarkdown(items);
		if (!this.chronosMarkdown.length) {
			this.renderInstructionsOnEmptyResults();
			return;
		}

		const timelineContainerEl = this.containerEl.createDiv(
			"chronos-bases-view-timeline-container",
		);
		const timeline = new ChronosTimeline({
			container: timelineContainerEl,
			settings: this.pluginSettings || {},
		});

		timeline.render(this.chronosMarkdown);
		// DRY: wire up note linking and hover preview
		wireSharedTimelineInteractions(
			timeline,
			this.fileUtils,
			this.app,
			timelineContainerEl,
			this.pluginSettings,
			"chronos-timeline", // Use custom source for BasesView
		);

		// render buttons
		this.renderCopyButton();
		this.renderShareButton();
	}

	private renderCopyButton() {
		const copyBtn = this.containerEl.createEl("button", {
			cls: "chronos-bases-view-copy-btn",
		});
		setTooltip(copyBtn, "Copy timeline markdown");
		setIcon(copyBtn, "copy");
		copyBtn.onclick = async () => {
			try {
				await navigator.clipboard.writeText(this.chronosMarkdown);
				new Notice("Timeline markdown copied!");
			} catch (e) {
				new Notice("Failed to copy timeline markdown");
			}
		};
	}

	private renderShareButton() {
		const shareBtn = this.containerEl.createEl("button", {
			cls: "chronos-bases-view-share-btn",
		});
		setTooltip(shareBtn, "Copy shareable public link");
		setIcon(shareBtn, "share-2");
		shareBtn.onclick = async () => {
			try {
				const url = this.buildShareableUrl();
				await navigator.clipboard.writeText(url);
				new Notice("Shareable public link copied to clipboard!");
			} catch (e) {
				new Notice("Failed to create shareable link");
			}
		};
	}
	private renderInstructionsOnEmptyResults() {
		this.containerEl.empty();
		this.containerEl.createDiv({
			cls: "chronos-empty-message",
			text: "No results found!",
		});
		const instructionsHtml = `
				<div class="chronos-instructions">
					<p>To enable timeline views, add frontmatter to your notes by typing <code>---</code> at the top, then add a <b>start</b> property with a date (like <code>2025</code>, <code>2025-03</code>, or <code>2025-03-14</code>).</p>
					<p>Available properties:</p>
					<ul>
                    	<li><b>start</b> <span style="color: var(--text-muted)">(required; YYYY-MM-DD...)</span></li>
						<li><b>end</b> <span style="color:  var(--text-muted)">(optional)</span></li>
						<li><b>color</b> <span style="color:  var(--text-muted)">(optional; named colors like red, blue, green, cyan or valid hexcode color)</span></li>
						<li><b>content</b> <span style="color:  var(--text-muted)">(optional; defaults to note title)</span></li>
						<li><b>type</b> <span style="color:  var(--text-muted)">(event, period, marker, point; defaults to event)</span></li>
						<li><b>description</b> <span style="color:  var(--text-muted)">(optional)</span></li>
					</ul>
					<a href="https://github.com/clairefro/obsidian-plugin-chronos?tab=readme-ov-file#obsidian-bases-view" target="_blank" rel="noopener noreferrer" style="display:block;margin-top:0.5em;">Learn more about Chronos Timeline Bases view</a>
				</div>
			`;
		const instructionsDiv = this.containerEl.createDiv({
			cls: "chronos-instructions",
		});
		instructionsDiv.innerHTML = instructionsHtml;
		return;
	}

	private buildShareableUrl() {
		let content = this.chronosMarkdown;
		// Remove all wikilinks ([[...]]) from the markdown for the shareable link
		content = content.replace(/\[\[.*?\]\]/g, "").trim();
		// For each line, if it ends with | and only whitespace, remove the pipe and whitespace
		content = content
			.split("\n")
			.map((line) => line.replace(/\|\s*$/, ""))
			.join("\n");
		const locale = this.pluginSettings.selectedLocale;

		// Start from the current origin+pathname and build query params fresh
		const url = new URL(CHRONOS_PLAYGROUND_BASE_URL);
		url.search = "";

		if (content && content.trim()) {
			try {
				const raw = content;

				// if compression is available, always attempt to compress it for shorter URLs.
				if (LZString && LZString.compressToEncodedURIComponent) {
					const compressed =
						LZString.compressToEncodedURIComponent(raw);
					// Use compressed value expected by playground
					// https://github.com/clairefro/chronos-timeline-md/blob/1b9dded9432d6bb11d0538e8bb023b0843f64299/index.html#L1691
					url.searchParams.set("content", compressed);
					url.searchParams.set("c", "1");
				} else {
					url.searchParams.set("content", raw);
				}
			} catch (e) {
				// On any error, fall back to raw content
				url.searchParams.set("content", content);
			}
		}

		if (locale && locale !== "en") {
			url.searchParams.set("locale", locale);
		}

		return url.toString();
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
	let lines = [];
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
		if (description) line += ` | ${description}`;
		lines.push(line);
	}
	if (lines.length > 15) {
		lines = ["> HEIGHT 500\n", ...lines];
	}
	return lines.join("\n");
}

// enforce strings for non-undefined vals; trim whitespace
function normalizeItemFields(item: {
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
		start: item.start !== undefined ? String(item.start).trim() : "",
		end: item.end !== undefined ? String(item.end).trim() : undefined,
		content:
			item.content !== undefined
				? String(item.content).trim()
				: undefined,
		color:
			item.color !== undefined
				? normalizeColor(String(item.color).trim())
				: undefined,
		type:
			item.type !== undefined
				? normalizeType(String(item.type).trim())
				: undefined,
		description:
			item.description !== undefined
				? String(item.description).trim()
				: undefined,
	};
}

function normalizeColor(color: string): string | undefined {
	if (!color) return undefined;
	const VALID_PRESET_COLORS = [
		"red",
		"orange",
		"yellow",
		"green",
		"cyan",
		"blue",
		"purple",
		"pink",
	];
	const lower = color.trim().toLowerCase();
	if (VALID_PRESET_COLORS.includes(lower)) {
		return lower;
	}
	// Check for valid hex code (3, 4, 6, or 8 digits, with or without #)
	const hex = color.trim().replace(/^#/, "");
	if (
		/^[0-9a-fA-F]{3}$/.test(hex) ||
		/^[0-9a-fA-F]{4}$/.test(hex) ||
		/^[0-9a-fA-F]{6}$/.test(hex) ||
		/^[0-9a-fA-F]{8}$/.test(hex)
	) {
		return hex;
	}
	return undefined;
}

function normalizeType(type: string) {
	if (!type) return undefined;
	const VALID_TYPES = ["event", "period", "point", "marker"];

	const lower = type.trim().toLowerCase();
	if (VALID_TYPES.includes(lower)) {
		return lower;
	} else {
		return undefined;
	}
}
