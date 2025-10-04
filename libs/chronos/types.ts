// Converted from ambient declarations to concrete exports for the portable lib
import { DataItem } from "vis-timeline";

export interface Marker {
	start: string;
	content: string;
}

export interface ChronosDataItem extends DataItem {
	cDescription?: string;
	cLink?: string;
	align?: "left" | "center" | "right";
}

export interface ChronosDataSetDataItem {
	content: string;
	start: Date;
	end: Date;
	cDescription?: string;
}

export interface ChronosPluginSettings {
	selectedLocale: string;
	key?: string;
	align: "left" | "center" | "right";
	clickToUse: boolean;
	roundRanges: boolean;
	useUtc: boolean;
	useAI: boolean;
	// Optional mapping from color name to CSS value for host environments.
	// If provided, these values will be used instead of theme CSS variables.
	colorMap?: Record<string, string>;
}

export type Group = { id: number; content: string };

export type Flags = {
	orderBy?: string[];
	defaultView?: { start?: string; end?: string };
	noToday?: boolean;
	height?: number;
};

export interface ParseResult {
	items: ChronosDataItem[];
	markers: Marker[];
	groups: Group[];
	flags: Flags;
}

export type ConstructItemParams = {
	content: string;
	start: string;
	separator: string | undefined;
	end: string | undefined;
	groupName: string | undefined;
	color: string | undefined;
	lineNumber: number;
	type: "default" | "background" | "point";
	cLink?: string;
};

export type ChronosTimelineConstructor = {
	container: HTMLElement;
	settings: ChronosPluginSettings;
	// Optional runtime hooks and styling overrides for host environments
	callbacks?: {
		// Optional tooltip setter override for host environments (e.g. Obsidian)
		setTooltip?: (el: Element, text: string) => void;
	};
	cssRootClass?: string; // optional root class to scope injected styles
};
