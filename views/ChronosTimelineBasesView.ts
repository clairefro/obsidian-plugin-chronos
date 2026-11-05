import {
	BasesAllOptions,
	BasesEntry,
	BasesPropertyId,
	BasesPropertyOption,
	BasesView,
	BasesViewConfig,
	setIcon,
	QueryController,
	NullValue,
	ListValue,
} from "obsidian";

import { ChronosPluginSettings } from "../types";
import { BASES_PROP_NAMES_DEFAULTS } from "../constants";
import * as ChronosLib from "chronos-timeline-md";
import { obsidianTooltip } from "../util/obsidianTooltip";
import { applyGapSetting } from "../util/applyGapSetting";
import { attachTimelineMenu } from "../util/timelineMenu";
import {
	DateField,
	findInvalidDateFields,
	normalizeDateValue,
} from "../util/validateItemDates";
type ChronosTimelineCtor = typeof ChronosLib.ChronosTimeline;
const chronosLibExports = ChronosLib as unknown as {
	ChronosTimeline?: ChronosTimelineCtor;
	default?: ChronosTimelineCtor;
};
const ChronosTimeline: ChronosTimelineCtor =
	chronosLibExports.ChronosTimeline ??
	chronosLibExports.default ??
	(ChronosLib as unknown as ChronosTimelineCtor);
import { FileUtils } from "../util/FileUtils";
import { wireSharedTimelineInteractions } from "../util/wireSharedTimelineInteractions";

export class ChronosTimelineBasesView extends BasesView {
	//  unique ID that appears in the "Add View" menu
	static VIEW_TYPE = "chronos-timeline-view";
	type: string = ChronosTimelineBasesView.VIEW_TYPE;
	private static instances = new Set<ChronosTimelineBasesView>();

	/** Re-render all open Bases timelines, e.g. after plugin settings change. */
	static refreshAll() {
		for (const view of ChronosTimelineBasesView.instances) {
			try {
				view.refresh();
			} catch (e) {
				console.error("[Chronos] Failed to refresh Bases view", e);
			}
		}
	}

	private pluginSettings: ChronosPluginSettings;
	private fileUtils: FileUtils;

	// The last generated Chronos markdown text. If undefined, none has been generated yet.
	private chronosMarkdown?: string;

	private warningEl: HTMLDivElement;
	// Identifies the warning last rendered, so the list (and its open state) isn't rebuilt needlessly.
	private lastWarningKey?: string;

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
		this.warningEl = containerEl.createDiv();

		ChronosTimelineBasesView.instances.add(this);
	}

	onunload() {
		ChronosTimelineBasesView.instances.delete(this);
	}

	private refresh() {
		this.chronosMarkdown = undefined;
		this.onDataUpdated();
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
				const filePath = entry.file.path;

				/** automatically postpend a wikilink to this note so users can click to open */
				const descriptionRaw = this.lookupFlatText(
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
					content: this.lookupFlatText(entry, "content") || fileName,
					color: normalizeColor(this.lookupProperty(entry, "color")),
					type: normalizeType(this.lookupProperty(entry, "type")),
					description,
					fileName,
					filePath,
				};
			});
		});

		const { markdown, invalid } = chronosItemsToMarkdown(items);
		this.renderInvalidWarning(invalid);
		this.renderResults(markdown);
	}

	/** Collapsible banner above the timeline listing notes skipped for invalid date values. */
	private renderInvalidWarning(invalid: InvalidItem[]) {
		const key = invalid
			.map(
				(i) =>
					`${i.filePath}:${i.fields.join(",")}:${i.start}:${i.end}`,
			)
			.join("|");
		if (key === this.lastWarningKey) return;
		this.lastWarningKey = key;

		this.warningEl.empty();
		if (invalid.length === 0) return;

		const MAX_LISTED = 50;
		const count = invalid.length;
		const propNames = [...new Set(invalid.flatMap((i) => i.fields))].map(
			(field) => this.propertyDisplayName(field) ?? field,
		);

		const details = this.warningEl.createEl("details", {
			cls: "chronos-bases-warning",
		});
		const summary = details.createEl("summary");
		setIcon(
			summary.createSpan({ cls: "chronos-bases-warning-chevron" }),
			"chevron-right",
		);
		setIcon(
			summary.createSpan({ cls: "chronos-bases-warning-icon" }),
			"alert-triangle",
		);
		summary.createSpan({
			text: `${count} ${count === 1 ? "note" : "notes"} skipped: invalid ${propNames.join("/")} value`,
		});

		details.createEl("p", {
			cls: "chronos-bases-warning-hint",
			text: "Use dates like YYYY, YYYY-MM or YYYY-MM-DD. Fix these notes and they will appear automatically.",
		});

		const list = details.createEl("ul");
		for (const item of invalid.slice(0, MAX_LISTED)) {
			const li = list.createEl("li");
			const link = li.createEl("a", {
				text: item.fileName,
				cls: "chronos-bases-warning-link",
			});
			link.onclick = (e) => {
				e.preventDefault();
				void this.app.workspace.openLinkText(item.filePath, "", false);
			};
			const values = item.fields
				.filter((f, idx, arr) => arr.indexOf(f) === idx)
				.map((f) => {
					const name = this.propertyDisplayName(f) ?? f;
					const value = f === "start" ? item.start : item.end;
					return `${name}: "${value ?? ""}"`;
				});
			li.createSpan({
				cls: "chronos-bases-warning-values",
				text: ` ${values.join(", ")}`,
			});
		}
		if (count > MAX_LISTED) {
			list.createEl("li", { text: `…and ${count - MAX_LISTED} more` });
		}
	}

	private propertyDisplayName(prop: ItemPropertyName): string | undefined {
		const propId = this.config.getAsPropertyId(configKey(prop));
		// property ids look like "note.start" or "formula.myStart"
		return propId?.split(".").slice(1).join(".") || undefined;
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
					"valid value (YYYY, YYYY-MM, YYYY-MM-DD...) for Start Date in Item Property Sources.",
			});

			this.renderInstructions();

			return;
		}

		// Otherwise, render the Chronos Timeline.
		const timelineContainerEl = this.resultsEl.createDiv(
			"chronos-bases-view-timeline-container",
		);
		attachTimelineMenu(
			timelineContainerEl,
			() => this.chronosMarkdown ?? "",
			this.pluginSettings,
		);
		const timeline = new ChronosTimeline({
			container: timelineContainerEl,
			settings: this.pluginSettings || {},
			callbacks: { setTooltip: obsidianTooltip },
		});

		timeline.render(this.chronosMarkdown);
		applyGapSetting(timeline, this.chronosMarkdown, this.pluginSettings);
		// DRY: wire up note linking and hover preview
		wireSharedTimelineInteractions(
			timeline,
			this.fileUtils,
			this.app,
			timelineContainerEl,
			this.pluginSettings,
			"chronos-timeline", // Use custom source for BasesView
		);
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

	// Text properties may be YAML lists: join items into one line so the
	// Chronos item stays on a single line.
	private lookupFlatText(
		entry: BasesEntry,
		prop: "description" | "content",
	): string | undefined {
		const propId = this.config.getAsPropertyId(configKey(prop));
		if (!propId) return undefined;
		const val = entry.getValue(propId);
		if (val == null || val instanceof NullValue) return undefined;
		let text: string;
		if (val instanceof ListValue) {
			const parts: string[] = [];
			for (let i = 0; i < val.length(); i++) {
				const item = val.get(i);
				if (item instanceof NullValue) continue;
				const str = item.toString().trim();
				if (str) parts.push(str);
			}
			text = parts.join(", ");
		} else {
			text = val.toString();
		}
		return text.replace(/\s*\r?\n\s*/g, " ").trim() || undefined;
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
		notes: "Options: event, period, marker, point. Defaults to point, or event if there is an end date or start ends with ~ (ongoing).",
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
			// console.info(
			// 	"[Chronos] New View detected. Configuring with default property sources.",
			// );
			const propNames = getDefaultPropNames(
				pluginSettings.basesPropNames,
			);
			for (const prop of itemPropertyNames) {
				viewConfig.set(configKey(prop), `note.${propNames[prop]}`);
			}
		}
		// Otherwise, this is probably a legacy View. Let's port the old settings over.
		else {
			// console.info("[Chronos] Legacy View detected. Porting settings.");
			// for (const prop of itemPropertyNames) {
			// 	viewConfig.set(configKey(prop), selectedProps[prop]);
			// }
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
	return val == null || val instanceof NullValue
		? undefined
		: val.toString().trim();
}

interface InvalidItem {
	fileName: string;
	filePath: string;
	fields: DateField[];
	start: string;
	end?: string;
}

// Convert item objects to Chronos markdown string, collecting items with invalid dates
function chronosItemsToMarkdown(
	items: {
		start?: string;
		end?: string;
		group?: string;
		content?: string;
		color?: string;
		type?: string;
		description?: string;
		fileName?: string;
		filePath?: string;
	}[],
): { markdown: string; invalid: InvalidItem[] } {
	let lines = [];
	const invalid: InvalidItem[] = [];
	for (const item of items) {
		const { group, content, color, type, description } = item;

		// skip items without start
		if (!item.start) continue;

		// convert common formats (YYYY/MM/DD, "Oct 14, 2026", ...) to Chronos dates
		const start = normalizeDateValue(item.start);
		const end = item.end ? normalizeDateValue(item.end) : undefined;

		// Format: <type> [start~end] content | "description"

		const TYPES: { [key: string]: string } = {
			event: "-",
			period: "@",
			point: "*",
			marker: "=",
		};

		// a trailing tilde on start (ex: "2020~") means ongoing to present
		const isOngoing = start.trim().endsWith("~");

		// default (no valid type): event if ranged (end date or ongoing), else point
		const resolvedType =
			type && TYPES[type] ? type : end || isOngoing ? "event" : "point";
		const startValue = end && isOngoing ? start.trim().slice(0, -1) : start;

		// skip notes with invalid dates instead of breaking the whole timeline
		const invalidFields = findInvalidDateFields(startValue, end);
		if (invalidFields.length > 0) {
			invalid.push({
				fileName: item.fileName ?? "Untitled",
				filePath: item.filePath ?? "",
				fields: invalidFields,
				start: item.start,
				end: item.end,
			});
			continue;
		}

		let line = `${TYPES[resolvedType]} [${startValue}`;
		if (end) line += `~${end}`;
		line += "]";
		if (color) line += ` #${color} `;
		if (group) line += ` {${group}} `;
		if (content) line += ` ${content}`;
		if (resolvedType !== "marker" && description)
			line += ` | ${description}`;
		lines.push(line);
	}
	if (lines.length > 15) {
		lines = ["> HEIGHT 500\n", ...lines];
	}
	return { markdown: lines.join("\n"), invalid };
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
