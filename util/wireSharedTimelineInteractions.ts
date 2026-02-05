// Utility to wire ChronosTimeline events for note linking and hover preview
// Put timeline interactions shared by Editor and Bases timeline views in here

import { App } from "obsidian";
import { ChronosPluginSettings } from "../types";
import { FileUtils } from "./FileUtils";

export function wireSharedTimelineInteractions(
	timeline: any,
	fileUtils: FileUtils,
	app: App,
	container: HTMLElement,
	settings: ChronosPluginSettings,
) {
	let lastEventTime = 0;
	const THROTTLE_MS = 500;

	// Note linking on click
	timeline.on("mouseDown", (event: any) => {
		const now = performance.now();
		if (now - lastEventTime < THROTTLE_MS) {
			event.event.stopImmediatePropagation();
			event.event.preventDefault();
			return;
		}
		lastEventTime = now;

		if (event.event instanceof MouseEvent) {
			event.event.stopImmediatePropagation();
			event.event.preventDefault();

			const itemId = event.item;
			if (!itemId) return;

			const item = timeline.items?.find((i: any) => i.id === itemId);
			if (!item?.cLink) return;

			const isMiddleClick = event.event.button === 1;
			const isCmdClick = event.event.metaKey && event.event.button === 0;
			const isShiftClick = event.event.shiftKey;
			const shouldOpenInNewLeaf =
				isMiddleClick || isCmdClick || isShiftClick;
			fileUtils.openFileFromWikiLink(item.cLink, shouldOpenInNewLeaf);
		}
	});

	// Hover preview for linked notes
	timeline.on("itemover", async (event: any) => {
		const itemId = event.item;
		if (itemId) {
			const item = timeline.items?.find((i: any) => i.id === itemId);
			if (item?.cLink) {
				let targetEl = event.event.target as HTMLElement;
				// Fallback: if not a valid element, use container
				if (
					!(targetEl instanceof HTMLElement) ||
					!container.contains(targetEl)
				) {
					targetEl = container;
				}
				app.workspace.trigger("hover-link", {
					event: event.event,
					source: "chronos-timeline",
					hoverParent: container,
					targetEl,
					linktext: item.cLink,
				});
			}
		}
	});

	// Close preview on item out
	timeline.on("itemout", () => {
		app.workspace.trigger("hover-link:close");
	});

	// Click-to-use support (if enabled)
	if (settings.clickToUse && container) {
		timeline.timeline?.setOptions({ clickToUse: settings.clickToUse });
		timeline.on("mouseOver", () => {
			// Tooltip logic removed (deprecated)
		});
	}
}
