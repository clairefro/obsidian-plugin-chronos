import {
	BasesView,
	setIcon,
	setTooltip,
	QueryController,
	Notice,
} from "obsidian";
import { ChronosTimeline } from "chronos-timeline-md";
import { ChronosPluginSettings } from "../types";
import { CHRONOS_PLAYGROUND_BASE_URL } from "../constants";
import LZString from "lz-string";

export class ChronosTimelineBasesView extends BasesView {
	// This unique ID is what appears in the "Add View" menu
	static VIEW_TYPE = "chronos-timeline-bases-view";
	type: string = ChronosTimelineBasesView.VIEW_TYPE;
	private containerEl: HTMLElement;
	private pluginSettings: ChronosPluginSettings;
	private chronosMarkdown: string = "";

	constructor(
		controller: QueryController,
		parentEl: HTMLElement,
		pluginSettings: ChronosPluginSettings,
	) {
		super(controller);
		this.containerEl = parentEl.createDiv("chronos-bases-view-container");

		this.pluginSettings = pluginSettings;
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
				</div>
			`;
			const instructionsDiv = this.containerEl.createDiv({
				cls: "chronos-instructions",
			});
			instructionsDiv.innerHTML = instructionsHtml;
			return;
		}

		const entries = this.data.data; // BasesEntry[]

		const items = entries.map((entry) => {
			const start = (entry.getValue("note.start") as any)?.data;
			const end = (entry.getValue("note.end") as any)?.data || undefined;
			// content defaults to filename unless overriden by note.content
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

		// TODO: helper for converting data to chronos string
		this.chronosMarkdown = chronosItemsToMarkdown(items);

		const timelineContainerEl = this.containerEl.createDiv(
			"chronos-bases-view-timeline-container",
		);
		const timeline = new ChronosTimeline({
			container: timelineContainerEl,
			settings: this.pluginSettings || {},
		});
		timeline.render(this.chronosMarkdown);

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
		// Styles moved to styles.css
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
		// Styles moved to styles.css
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

	private buildShareableUrl() {
		const content = this.chronosMarkdown;
		const locale = this.pluginSettings.selectedLocale;

		const globalObject: any =
			typeof globalThis !== "undefined" ? globalThis : window;

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
		if (description) line += ` |${description}`;
		lines.push(line);
	}
	if (lines.length > 15) {
		lines = ["> HEIGHT 500\n", ...lines];
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
