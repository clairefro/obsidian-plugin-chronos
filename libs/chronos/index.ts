import { ChronosMdParser } from "./ChronosMdParser";
import { DEFAULT_LOCALE } from "./constants";
import type { ParseResult, ChronosPluginSettings } from "./types";
import { ChronosTimeline } from "./ChronosTimeline";
import { CHRONOS_DEFAULT_CSS } from "./defaultStyles";

export type CoreParseOptions = {
	selectedLocale?: string;
	roundRanges?: boolean;
	settings?: Partial<ChronosPluginSettings>;
	callbacks?: {
		onItemClick?: (item: any, event: Event) => void;
		onTimelineClick?: (event: Event) => void;
		onItemDoubleClick?: (item: any, event: Event) => void;
	};
	cssVars?: Record<string, string>;
	cssRootClass?: string;
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
	const settings: ChronosPluginSettings = {
		selectedLocale: DEFAULT_LOCALE,
		...options?.settings,
	} as ChronosPluginSettings;

	// apply CSS variables if provided
	if (options?.cssVars || options?.cssRootClass) {
		attachChronosStyles(
			document,
			undefined,
			options.cssVars,
			options.cssRootClass,
		);
	}

	const timeline = new ChronosTimeline({
		container,
		settings,
		callbacks: options?.callbacks,
		cssRootClass: options?.cssRootClass,
	});
	const parsed = timeline.render(source);
	return { timeline, parsed };
}

export function attachChronosStyles(
	doc: Document = document,
	css: string = CHRONOS_DEFAULT_CSS,
	cssVars?: Record<string, string>,
	cssRootClass?: string,
) {
	const style = doc.createElement("style");
	style.setAttribute("data-chronos-core", "1");
	let finalCss = css ?? CHRONOS_DEFAULT_CSS;
	if (cssVars) {
		// inject css variable declarations at :root
		const vars = Object.entries(cssVars)
			.map(([k, v]) => `  --${k}: ${v};`)
			.join("\n");
		finalCss = `:root {\n${vars}\n}\n` + finalCss;
	}
	style.textContent = finalCss;
	doc.head.appendChild(style);

	// If a cssRootClass is provided, insert a second stylesheet scoped to that class
	// that will be appended after the defaults so it overrides by cascade.
	if (cssRootClass) {
		const scopedStyle = doc.createElement("style");
		scopedStyle.setAttribute("data-chronos-core-scoped", cssRootClass);

		// Create scoped CSS by prefixing the default selectors and moving :root vars into the root class
		const scopedCss = scopeCssForRootClass(finalCss, cssRootClass);
		scopedStyle.textContent = scopedCss;
		doc.head.appendChild(scopedStyle);
	}
}

function scopeCssForRootClass(cssText: string, rootClass: string) {
	// Move :root variables to the scoped root class and prefix chronos selectors.
	// This replaces ":root {" with ".<rootClass> {" and converts
	// ".chronos-timeline-container" selectors to ".<rootClass>.chronos-timeline-container" so
	// the host class can be applied directly to the visible container element.
	// The scoped stylesheet is appended after the default stylesheet so it will override rules
	// in the cascade even when specificity is equal.
	const classSel = `.${rootClass}`;
	let out = cssText.replace(/:root\s*\{/g, `${classSel} {`);
	// Ensure container selectors are targeted at the host-classed container element.
	out = out.replace(
		/\.chronos-timeline-container/g,
		`${classSel}.chronos-timeline-container`,
	);
	return out;
}

export type {
	ParseResult,
	ChronosDataItem,
	Marker,
	Group,
	Flags,
	ChronosPluginSettings,
} from "./types";
