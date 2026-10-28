import {
	BasesAllOptions,
	BasesEntry,
	BasesPropertyId,
	BasesPropertyOption,
	BasesView,
	BasesViewConfig,
	setIcon,
	setTooltip,
	QueryController,
	Notice,
	NullValue,
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
	static VIEW_TYPE = "chronos-timeline-view";
	type: string = ChronosTimelineBasesView.VIEW_TYPE;
	private pluginSettings: ChronosPluginSettings;
	private fileUtils: FileUtils;

	// The last generated Chronos markdown text. If undefined, none has been generated yet.
	private chronosMarkdown?: string;

	private resultsEl: HTMLDivElement;

	constructor(
		controller: QueryController,
		parentEl: HTMLElement,
		pluginSettings: ChronosPluginSettings,
	) {
		super(controller);
		this.pluginSettings = pluginSettings;

		// FileUtils instance for note linking
		this.fileUtils = new FileUtils({ app: this.app });

		const containerEl = parentEl.createDiv("chronos-bases-view-container");
		this.resultsEl = containerEl.createDiv();
	}

	public onDataUpdated(): void {
		// Make sure that the view options are initialized.
		//
		// We have to call this here to ensure that legacy views are properly
		// ported to the new format before running any rendering code. There are
		// a few reasons for this:
		//
		// * The callback for generating the option list (`generateViewOptions`)
		//   is only called when the options are being viewed, which only happens
		//   when creating a new view or when explicitly opening the options menu;
		//   it's not called when opening an already-created view.
		// * The view constructor and onload callback are called when opening an
		//   already-created view, but for some bizarre reason, `this.config` has
		//   not yet been set at any point of either function, so we can't hook
		//   this into those.
		//
		// This initialization call is designed to determine as quickly as possible
		// whether work needs to be done and exit immediately if no work is needed,
		// so it shouldn't have significant impact on performance despite being
		// called each time data is updated.
		initializeViewOptions(this.pluginSettings, this.config);

		const items = this.data.groupedData.flatMap((groupEntries) => {
			// NOTE:
			// * key == undefined means there's no grouping applied to the view at all.
			// * key != undefined && !entry.hasKey() means grouping is applied, but this
			//       set of entries has no value for the given grouping key.
			// * key != undefined && entry.hasKey() means grouping is applied, and this
			//       set of entries has a non-null/empty value for the given grouping key.
			const baseGroup =
				groupEntries.key === undefined
					? undefined
					: groupEntries.hasKey()
						? groupEntries.key.toString()
						: "";
			return groupEntries.entries.map((entry) => {
				const fileName =
					getValueAsString(entry, "file.name") || "Untitled";

				/** automatically postpend a wikilink to this note so users can click to open */
				const descriptionRaw = this.lookupProperty(
					entry,
					"description",
				);
				const description = `${descriptionRaw ? descriptionRaw + " " : ""}[[${fileName}]]`;

				// Only fall back to direct property access if the View provided no
				// grouping settings at all.
				const group =
					baseGroup !== undefined
						? baseGroup
						: this.lookupProperty(entry, "group");

				return {
					start: this.lookupProperty(entry, "start"),
					end: this.lookupProperty(entry, "end"),
					group,
					content: this.lookupProperty(entry, "content") || fileName,
					color: normalizeColor(this.lookupProperty(entry, "color")),
					type: normalizeType(this.lookupProperty(entry, "type")),
					description,
				};
			});
		});

		this.renderResults(chronosItemsToMarkdown(items));
	}

	private renderResults(newChronosMarkdown: string) {
		// If there aren't any updates that affected the markdown, we don't need to change anything.
		if (newChronosMarkdown === this.chronosMarkdown) {
			return;
		}
		this.chronosMarkdown = newChronosMarkdown;

		// Otherwise, we need to rebuild the view.
		this.resultsEl.empty();

		// If the results are empty now, display a helpful message communicating that.
		if (newChronosMarkdown === "") {
			this.resultsEl.createDiv({
				cls: "chronos-empty-message",
				text: "No results found!",
			});

			this.resultsEl.createEl("p", {
				text:
					"To enable timeline views, you must have at least one note with a " +
					"valid value for Start Date in Item Property Sources.",
			});

			this.renderInstructions();

			return;
		}

		// Otherwise, render the Chronos Timeline.
		const timelineContainerEl = this.resultsEl.createDiv(
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

	private lookupProperty(
		entry: BasesEntry,
		prop: ItemPropertyName,
	): string | undefined {
		const propId = this.config.getAsPropertyId(configKey(prop));
		if (propId) {
			return getValueAsString(entry, propId);
		}
	}

	private renderCopyButton() {
		const copyBtn = this.resultsEl.createEl("button", {
			cls: "chronos-bases-view-copy-btn",
		});
		setTooltip(copyBtn, "Copy timeline markdown");
		setIcon(copyBtn, "copy");
		copyBtn.onclick = async () => {
			try {
				await navigator.clipboard.writeText(this.chronosMarkdown ?? "");
				new Notice("Timeline markdown copied!");
			} catch (e) {
				new Notice("Failed to copy timeline markdown");
			}
		};
	}

	private renderShareButton() {
		const shareBtn = this.resultsEl.createEl("button", {
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

	// Help text and link, shown only when no timeline is rendered.
	private renderInstructions() {
		const instructionsDiv = this.resultsEl.createDiv({
			cls: "chronos-instructions",
		});

		const link = instructionsDiv.createEl("a", {
			cls: "chronos-instructions-link",
			text: "Learn more about Chronos Timeline Bases view",
			href: "https://github.com/clairefro/obsidian-plugin-chronos?tab=readme-ov-file#obsidian-bases-view",
		});
		link.target = "_blank";
		link.rel = "noopener noreferrer";
	}

	private buildShareableUrl() {
		let content = this.chronosMarkdown ?? "";
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

/** --- OPTIONS ---- */

export const itemPropertyNames = [
	"start",
	"end",
	"type",
	"color",
	"group",
	"content",
	"description",
] as const;

export type ItemPropertyName = (typeof itemPropertyNames)[number];

export const itemProps = {
	start: {
		displayName: "Start Date",
		required: "Required",
		notes: "YYYY-MM-DD format.",
	},
	end: {
		displayName: "End Date",
		required: "Recommended",
		notes: "YYYY-MM-DD format.",
	},
	type: {
		displayName: "Item Type",
		required: "Recommended",
		notes: "Options: event (default), period, marker, point.",
	},
	color: {
		displayName: "Color",
		required: "Optional",
		notes: "Options: valid hexcode color, or one of these: red, orange, yellow, green, blue, purple, pink, cyan.",
	},
	group: {
		displayName: "Group",
		required: "Optional",
		notes: "Also manageable via the Base View 'Group by' UI.",
	},
	content: {
		displayName: "Title Content",
		required: "Optional",
		notes: "Defaults to note title.",
	},
	description: {
		displayName: "Description",
		required: "Optional",
		notes: "Additional text to display on hover.",
	},
} as const;

// Converts the name of an item property to its corresponding config key in the View.
// This is necessary because Obsidian mixes plugin-defined options with the base options,
// and "type" is already used in the base options to store the View type.
function configKey(prop: ItemPropertyName): string {
	return `chronos.${prop}`;
}

// This function makes sure that the view options are set up with the correct
// default values without preventing the user from clearing the field. It also
// ports legacy view configuration (via global settings + visible properties)
// to the new format seamlessly.
function initializeViewOptions(
	pluginSettings: ChronosPluginSettings,
	viewConfig: BasesViewConfig,
) {
	// Check the config schema.
	const SCHEMA_KEY = "chronos.config-schema";
	const configSchema = viewConfig.get(SCHEMA_KEY);
	if (configSchema === undefined) {
		// If the schema is "undefined," this is either a new view, or an
		// existing view created in an older version of the plugin (<=4.1.2).
		// We can scan for the legacy prop names to see if any of them are
		// visible. If they are, we can import them! If none of them are, we
		// can populate the defaults with the global setting.
		const legacyPropNames = getDefaultPropNames(
			pluginSettings.legacyBasesPropNames,
		);
		const visibleProps = viewConfig.getOrder();

		const selectedProps = Object.fromEntries(
			itemPropertyNames.map((prop) => {
				// To match legacy behaviour, if both the formula version of the base name
				// *and* the frontmatter version of the base name are visible, prioritize
				// the formula version.
				const propName = legacyPropNames[prop];
				if (visibleProps.contains(`formula.${propName}`)) {
					return [prop, `formula.${propName}`];
				}
				if (visibleProps.contains(`note.${propName}`)) {
					return [prop, `note.${propName}`];
				}
				return [prop, undefined];
			}),
		);

		// If we found none of the default properties, this is probably a new View.
		// Let's initialize it.
		if (Object.values(selectedProps).every((val) => val === undefined)) {
			console.info(
				"[Chronos] New View detected. Configuring with default property sources.",
			);
			const propNames = getDefaultPropNames(
				pluginSettings.basesPropNames,
			);
			for (const prop of itemPropertyNames) {
				viewConfig.set(configKey(prop), `note.${propNames[prop]}`);
			}
		}
		// Otherwise, this is probably a legacy View. Let's port the old settings over.
		else {
			console.info("[Chronos] Legacy View detected. Porting settings.");
			for (const prop of itemPropertyNames) {
				viewConfig.set(configKey(prop), selectedProps[prop]);
			}
		}

		// Set the schema to a defined value so that we don't keep doing this.
		viewConfig.set(SCHEMA_KEY, 1);
	}
}

export function generateViewOptions(
	pluginSettings: ChronosPluginSettings,
	viewConfig: BasesViewConfig,
): BasesAllOptions[] {
	// This needs to be called here or else the default settings won't show up
	// in the options menu after creating a new view until you close it and
	// re-open it.
	initializeViewOptions(pluginSettings, viewConfig);

	return [
		{
			displayName: "Item Property Sources",
			type: "group",
			items: itemPropertyNames.map((prop): BasesPropertyOption => {
				return {
					key: configKey(prop),
					type: "property",
					displayName: itemProps[prop].displayName,
					placeholder: itemProps[prop].required.toLowerCase(),
				};
			}),
		},
	];
}

/** --- HELPERS ---- */

export function getDefaultPropNames(nameSettings?: {
	start?: string;
	end?: string;
	group?: string;
	content?: string;
	color?: string;
	type?: string;
	description?: string;
}): {
	start: string;
	end: string;
	group: string;
	content: string;
	color: string;
	type: string;
	description: string;
} {
	return {
		start: nameSettings?.start || BASES_PROP_NAMES_DEFAULTS.start,
		end: nameSettings?.end || BASES_PROP_NAMES_DEFAULTS.end,
		group: nameSettings?.group || BASES_PROP_NAMES_DEFAULTS.group,
		content: nameSettings?.content || BASES_PROP_NAMES_DEFAULTS.content,
		color: nameSettings?.color || BASES_PROP_NAMES_DEFAULTS.color,
		type: nameSettings?.type || BASES_PROP_NAMES_DEFAULTS.type,
		description:
			nameSettings?.description || BASES_PROP_NAMES_DEFAULTS.description,
	};
}

// Look up a property on an entry, convert it to a string, trim the result.
// Returns undefined if the entry does not have this property (or its value
// for the property is null).
function getValueAsString(
	entry: BasesEntry,
	propId: BasesPropertyId,
): string | undefined {
	const val = entry.getValue(propId);
	return val == null
		? undefined
		: val.equals(NullValue.value)
			? undefined
			: val.toString().trim();
}

// Convert item object to Chronos markdown string
function chronosItemsToMarkdown(
	items: {
		start?: string;
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
		if (
			(type === undefined || type === "point" || type === "event") &&
			description
		)
			line += ` | ${description}`;
		lines.push(line);
	}
	if (lines.length > 15) {
		lines = ["> HEIGHT 500\n", ...lines];
	}
	return lines.join("\n");
}

function normalizeColor(color: string | undefined): string | undefined {
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

function normalizeType(type: string | undefined): string | undefined {
	if (!type) return undefined;
	const VALID_TYPES = ["event", "period", "point", "marker"];

	const lower = type.trim().toLowerCase();
	if (VALID_TYPES.includes(lower)) {
		return lower;
	} else {
		return undefined;
	}
}
