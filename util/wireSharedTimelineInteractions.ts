// Utility to wire ChronosTimeline events for note linking and hover preview
// Put timeline interactions shared by Editor and Bases timeline views in here

import { App } from "obsidian";
import { ChronosPluginSettings } from "../types";
import { FileUtils } from "./FileUtils";

interface TimelineItem {
	id?: unknown;
	cLink?: string;
	type?: string;
	start?: Date | string | number;
	end?: Date | string | number;
	group?: unknown;
}

interface TimelineEvent {
	item?: unknown;
	time?: Date | string | number;
	group?: unknown;
	event: MouseEvent;
}

interface TimelineLike {
	items?: TimelineItem[];
	timeline?: { setOptions: (opts: Record<string, unknown>) => void };
	on: (name: string, cb: (event: TimelineEvent) => void) => void;
}

/** Background items (periods) may not report as event.item, so find one by time/group */
function findLinkedPeriodAt(
	items: TimelineItem[] | undefined,
	event: TimelineEvent,
): TimelineItem | undefined {
	if (event.time === undefined || event.time === null) return undefined;
	const t = new Date(event.time).getTime();
	if (Number.isNaN(t)) return undefined;
	return items?.find((i) => {
		if (i.type !== "background" || !i.cLink || !i.start || !i.end)
			return false;
		if (
			i.group !== undefined &&
			i.group !== null &&
			event.group !== i.group
		)
			return false;
		return (
			new Date(i.start).getTime() <= t && t <= new Date(i.end).getTime()
		);
	});
}

export function wireSharedTimelineInteractions(
	timeline: TimelineLike,
	fileUtils: FileUtils,
	app: App,
	container: HTMLElement,
	settings: ChronosPluginSettings,
	hoverSource: "preview" | "chronos-timeline" = "chronos-timeline",
) {
	let lastEventTime = 0;
	const THROTTLE_MS = 500;

	// Note linking on click
	timeline.on("mouseDown", (event: TimelineEvent) => {
		const now = performance.now();
		if (now - lastEventTime < THROTTLE_MS) {
			event.event.stopImmediatePropagation();
			event.event.preventDefault();
			return;
		}
		lastEventTime = now;

		if (event.event.instanceOf(MouseEvent)) {
			event.event.stopImmediatePropagation();
			event.event.preventDefault();

			const itemId = event.item;
			const item = itemId
				? timeline.items?.find((i) => i.id === itemId)
				: findLinkedPeriodAt(timeline.items, event);
			if (!item?.cLink) return;

			const isMiddleClick = event.event.button === 1;
			const isCmdClick = event.event.metaKey && event.event.button === 0;
			const isShiftClick = event.event.shiftKey;
			const shouldOpenInNewLeaf =
				isMiddleClick || isCmdClick || isShiftClick;
			void fileUtils.openFileFromWikiLink(
				item.cLink,
				shouldOpenInNewLeaf,
			);
		}
	});

	// Hover preview for linked notes
	timeline.on("itemover", (event: TimelineEvent) => {
		const itemId = event.item;
		{
			const item = itemId
				? timeline.items?.find((i) => i.id === itemId)
				: findLinkedPeriodAt(timeline.items, event);
			if (item?.cLink) {
				let targetEl = event.event.target as HTMLElement;
				// Fallback: if not a valid element, use container
				if (
					!targetEl.instanceOf(HTMLElement) ||
					!container.contains(targetEl)
				) {
					targetEl = container;
				}
				app.workspace.trigger("hover-link", {
					event: event.event,
					source: hoverSource,
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
	}

	// mark scroll-blocking event listeners as passive
	// Example: container.addEventListener('touchstart', handler, { passive: true });
	["touchstart", "touchmove", "touchend"].forEach((evt) => {
		container.addEventListener(
			evt,
			(e) => {
				e.stopPropagation();
			},
			{ passive: true },
		);
	});
}
