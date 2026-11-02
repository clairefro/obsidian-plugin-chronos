import type { ChronosTimeline } from "chronos-timeline-md";
import { ChronosPluginSettings } from "../types";

export const DEFAULT_GAP = 20;

const GAP_FLAG = /^\s*>\s*GAP\b/im;

export function resolveGap(value: number | undefined): number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0
		? value
		: DEFAULT_GAP;
}

/**
 * Applies the plugin-level item gap to a rendered timeline. A `> GAP` flag in
 * the source takes precedence, since the library applies it itself.
 */
export function applyGapSetting(
	timeline: ChronosTimeline,
	source: string,
	settings: Partial<ChronosPluginSettings>,
): void {
	if (!timeline.timeline || GAP_FLAG.test(source)) return;
	timeline.timeline.setOptions({
		margin: {
			item: {
				horizontal: resolveGap(settings.gapHorizontal),
				vertical: resolveGap(settings.gapVertical),
			},
		},
	});
}
