// shim
import { DataItem } from "vis-timeline";

export interface Marker {
	start: string;
	content: string;
}
export type Align = "left" | "center" | "right";

interface ChronosDataItem extends DataItem {
	cDescription?: string; // prefixed c for chronos - special prop for event tooltips
	cLink?: string; // optional link
	align?: Align;
}

export interface ChronosDataSetDataItem {
	content: string;
	start: Date;
	end: Date;
	cDescription?: string; // prefixed c for chronos - special prop for event tooltips
}

export interface ChronosPluginSettings {
	key?: string; // LEGACY - DEPRECATED
	aiKeys?: Record<string, string>; // LEGACY - DEPRECATED
	selectedLocale: string;
	aiProvider?: string;
	openaiSecretName?: string;
	geminiSecretName?: string;
	aiModels?: Record<string, string>;
	align: Align;
	clickToUse: boolean;
	roundRanges: boolean;
	useUtc: boolean;
	useAI: boolean;
	lastSeenVersion?: string;
	showChangelogOnUpdate?: boolean;
	enableCaching?: boolean;
	basesPropNames: {
		start?: string;
		end?: string;
		group?: string;
		color?: string;
		content?: string;
		type?: string;
		description: string;
	};
}

export type Group = { id: number; content: string };

export type Flags = {
	orderBy?: string[];
	defaultView?: {
		start?: string;
		end?: string;
	};
	noToday?: boolean;
	height?: number;
};

export interface ParseResult {
	items: ChronosDataItem[];
	markers: Marker[];
	groups: Group[];
	flags: Flags;
}

interface ChronosTimelineConstructor {
	container: HTMLElement;
	settings: ChronosPluginSettings;
}

declare module "vis-timeline" {
	/** Add method override bc this method exists and is documented, but not registered in type definitions from library */
	interface Timeline {
		setCustomTimeMarker(content: string, id: string, show: boolean): void;
	}
}
