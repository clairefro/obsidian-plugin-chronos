import {
	BasesView,
	setIcon,
	setTooltip,
	QueryController,
	Notice,
	BasesEntry,
} from "obsidian";

import { ChronosPluginSettings } from "../types";
import {
	CHRONOS_PLAYGROUND_BASE_URL,
	BASES_PROP_NAMES_DEFAULTS,
} from "../constants";
import LZString from "lz-string";
import * as ChronosLib from "chronos-timeline-md";
const ChronosTimeline: any =
	(ChronosLib as any).ChronosTimeline ??
	(ChronosLib as any).default ??
	(ChronosLib as any);
import { FileUtils } from "../util/FileUtils";
import { wireSharedTimelineInteractions } from "../util/wireSharedTimelineInteractions";

export class ChronosTimelineBasesView extends BasesView {
	//  unique ID that appears in the "Add View" menu
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

		// Get property names from plugin settings, fallback to defaults
		const propNames = {
			start:
				this.pluginSettings?.basesPropNames?.start ||
				BASES_PROP_NAMES_DEFAULTS.start,
			end:
				this.pluginSettings?.basesPropNames?.end ||
				BASES_PROP_NAMES_DEFAULTS.end,
			group:
				this.pluginSettings?.basesPropNames?.group ||
				BASES_PROP_NAMES_DEFAULTS.group,
			content:
				this.pluginSettings?.basesPropNames?.content ||
				BASES_PROP_NAMES_DEFAULTS.content,
			color:
				this.pluginSettings?.basesPropNames?.color ||
				BASES_PROP_NAMES_DEFAULTS.color,
			type:
				this.pluginSettings?.basesPropNames?.type ||
				BASES_PROP_NAMES_DEFAULTS.type,
			description:
				this.pluginSettings?.basesPropNames?.description ||
				"description",
		};

		const items = entries.map((entry) => {
			// start --------
			let start = undefined;
			if (this.data.properties.includes(`note.${propNames.start}`)) {
				start =
					entry.getValue(`note.${propNames.start}`)?.toString() !==
					"null"
						? entry.getValue(`note.${propNames.start}`)?.toString()
						: undefined;
			}
			if (this.data.properties.includes(`formula.${propNames.start}`)) {
				start =
					entry.getValue(`formula.${propNames.start}`)?.toString() !==
					"null"
						? entry
								.getValue(`formula.${propNames.start}`)
								?.toString()
						: undefined;
			}

			// end --------
			let end = undefined;
			if (this.data.properties.includes(`note.${propNames.end}`)) {
				end =
					entry.getValue(`note.${propNames.end}`)?.toString() !==
					"null"
						? entry.getValue(`note.${propNames.end}`)?.toString()
						: undefined;
			}
			if (this.data.properties.includes(`formula.${propNames.end}`)) {
				end =
					entry.getValue(`formula.${propNames.end}`)?.toString() !==
					"null"
						? entry.getValue(`formula.${propNames.end}`)?.toString()
						: undefined;
			}

			// group --------
			let group = undefined;
			if (this.data.properties.includes(`note.${propNames.group}`)) {
				group =
					entry.getValue(`note.${propNames.group}`)?.toString() !==
					"null"
						? entry.getValue(`note.${propNames.group}`)?.toString()
						: undefined;
			}
			if (this.data.properties.includes(`formula.${propNames.group}`)) {
				group =
					entry.getValue(`formula.${propNames.group}`)?.toString() !==
					"null"
						? entry
								.getValue(`formula.${propNames.group}`)
								?.toString()
						: undefined;
			}

			// content --------
			let content = undefined;
			if (this.data.properties.includes(`note.${propNames.content}`)) {
				content =
					entry.getValue(`note.${propNames.content}`)?.toString() !==
					"null"
						? entry
								.getValue(`note.${propNames.content}`)
								?.toString()
						: undefined;
			}
			if (this.data.properties.includes(`formula.${propNames.content}`)) {
				content =
					entry
						.getValue(`formula.${propNames.content}`)
						?.toString() !== "null"
						? entry
								.getValue(`formula.${propNames.content}`)
								?.toString()
						: undefined;
			}
			if (!content) {
				content =
					(entry.getValue("file.name") as any)?.data || "Untitled";
			}

			// color --------
			let color = undefined;
			if (this.data.properties.includes(`note.${propNames.color}`)) {
				color =
					entry.getValue(`note.${propNames.color}`)?.toString() !==
					"null"
						? entry.getValue(`note.${propNames.color}`)?.toString()
						: undefined;
			}
			if (this.data.properties.includes(`formula.${propNames.color}`)) {
				color =
					entry.getValue(`formula.${propNames.color}`)?.toString() !==
					"null"
						? entry
								.getValue(`formula.${propNames.color}`)
								?.toString()
						: undefined;
			}

			// type --------
			let type = undefined;
			if (this.data.properties.includes(`note.${propNames.type}`)) {
				type =
					entry.getValue(`note.${propNames.type}`)?.toString() !==
					"null"
						? entry.getValue(`note.${propNames.type}`)?.toString()
						: undefined;
			}
			if (this.data.properties.includes(`formula.${propNames.type}`)) {
				type =
					entry.getValue(`formula.${propNames.type}`)?.toString() !==
					"null"
						? entry
								.getValue(`formula.${propNames.type}`)
								?.toString()
						: undefined;
			}

			// description --------
			let descriptionRaw = undefined;
			if (
				this.data.properties.includes(`note.${propNames.description}`)
			) {
				descriptionRaw =
					entry
						.getValue(`note.${propNames.description}`)
						?.toString() !== "null"
						? entry
								.getValue(`note.${propNames.description}`)
								?.toString()
						: undefined;
			}
			if (
				this.data.properties.includes(
					`formula.${propNames.description}`,
				)
			) {
				descriptionRaw =
					entry
						.getValue(`formula.${propNames.description}`)
						?.toString() !== "null"
						? entry
								.getValue(`formula.${propNames.description}`)
								?.toString()
						: undefined;
			}

			const fileName =
				(entry.getValue("file.name") as any)?.data || "Untitled";

			/** automatically postpend a wikilink to this note so users can click to open */
			const description = `${descriptionRaw ? descriptionRaw + " " : ""}[[${fileName}]]`;
			return normalizeItemFields({
				start,
				end,
				group,
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
		// Build a table of properties: canonical, user-selected, notes
		const propRows = [
			{
				canonical: "start",
				notes: "(required; YYYY-MM-DD...)",
			},
			{
				canonical: "end",
				notes: "(optional; YYYY-MM-DD...)",
			},
			{
				canonical: "color",
				notes: "(optional; named colors red|orange|yellow|green|blue|purple|pink|cyan, or valid hexcode color)",
			},
			{
				canonical: "content",
				notes: "(optional; defaults to note title)",
			},
			{
				canonical: "type",
				notes: "(event, period, marker, point; defaults to event)",
			},
			{
				canonical: "description",
				notes: "(optional)",
			},
		];
		// Get user-selected prop names from plugin settings, fallback to defaults
		const propNames: Record<string, string> =
			(this.pluginSettings && this.pluginSettings.basesPropNames) || {};
		const defaultPropNames: Record<string, string> =
			BASES_PROP_NAMES_DEFAULTS as any;
		const getUserPropName = (canonical: string) =>
			propNames[canonical] || defaultPropNames[canonical] || canonical;

		let tableRows = propRows
			.map(
				(row) =>
					`<tr>
						<td style="padding:0.25em;"><b>${row.canonical}</b></td>
						<td style="padding:0.25em;"><code>${getUserPropName(row.canonical)}</code></td>
						<td style="padding:0.25em;"><span style="color: var(--text-muted)">${row.notes}</span></td>
					</tr>`,
			)
			.join("");

		const instructionsHtml = `
			<div class="chronos-instructions">
				<p>To enable timeline views, add frontmatter to your notes by typing <code>---</code> at the top of a note, or use formulas to resolve the below prop names.</p>
				<p>Make sure the prop name is selected in the Properties setting of a Chronos Timeline Bases view.</p>
				<p>Available properties:</p>
				<table style="width:100%;border-collapse:collapse;">
					<thead>
						<tr>
							<th style="text-align:left;padding:0.25em;">Prop</th>
							<th style="text-align:left;padding:0.25em;">Prop name</th>
							<th style="text-align:left;padding:0.25em;">Notes</th>
						</tr>
					</thead>
					<tbody>
						${tableRows.replace(/<td>/g, '<td style="padding:0.25em;">')}
					</tbody>
				</table>
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
		group?: string;
		content?: string;
		color?: string;
		type?: string;
		description?: string;
	}[],
): string {
	let lines = [];
	for (const item of items) {
		const { start, end, group, content, color, type, description } = item;

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
		if (group) line += ` {${group}} `;
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
	group?: any;
	content?: any;
	color?: any;
	type?: any;
	description?: any;
}): {
	start: string;
	end?: string;
	group?: string;
	content?: string;
	color?: string;
	type?: string;
	description?: string;
} {
	return {
		start: item.start !== undefined ? String(item.start).trim() : "",
		end: item.end !== undefined ? String(item.end).trim() : undefined,
		group:
			item.content !== undefined ? String(item.group).trim() : undefined,
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
