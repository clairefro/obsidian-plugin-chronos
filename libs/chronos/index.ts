import { ChronosMdParser } from "./ChronosMdParser";
import { DEFAULT_LOCALE } from "./constants";
import type { ParseResult, ChronosPluginSettings } from "./types";
import { ChronosTimeline } from "./ChronosTimeline";
import { CHRONOS_DEFAULT_CSS } from "./defaultStyles";

export type CoreParseOptions = {
	selectedLocale?: string;
	roundRanges?: boolean;
};

export function parseChronos(
	source: string,
	options: CoreParseOptions = {},
): ParseResult {
	const locale = options.selectedLocale || DEFAULT_LOCALE;

	const minimalSettings: ChronosPluginSettings = {
		selectedLocale: locale,
		align: "left",
		clickToUse: false,
		roundRanges: !!options.roundRanges,
		useUtc: true,
		useAI: false,
	};

	const parser = new ChronosMdParser(locale);
	return parser.parse(source, minimalSettings as ChronosPluginSettings);
}

export function renderChronos(
	container: HTMLElement,
	source: string,
	options: CoreParseOptions = {},
) {
	const locale = options.selectedLocale || DEFAULT_LOCALE;
	const parser = new ChronosMdParser(locale);
	const parsed = parser.parse(source, {
		selectedLocale: locale,
		align: "left",
		clickToUse: false,
		roundRanges: !!options.roundRanges,
		useUtc: true,
		useAI: false,
	});

	const timeline = new ChronosTimeline({
		container,
		settings: {
			selectedLocale: locale,
			align: "left",
			clickToUse: false,
			roundRanges: !!options.roundRanges,
			useUtc: true,
			useAI: false,
		},
	});
	// render from parsed result
	timeline.renderParsed(parsed as any);

	return { timeline, parsed };
}

export function attachChronosStyles(
	doc: Document = document,
	css: string = CHRONOS_DEFAULT_CSS,
) {
	const id = "chronos-default-styles";
	if (doc.getElementById(id)) return;
	const style = doc.createElement("style");
	style.id = id;
	style.innerHTML = css;
	doc.head.appendChild(style);
}

export type {
	ParseResult,
	ChronosDataItem,
	Marker,
	Group,
	Flags,
	ChronosPluginSettings,
} from "./types";
