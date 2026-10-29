import { displayTooltip, setTooltip } from "obsidian";

/**
 * Tooltip callback for chronos-timeline-md that uses Obsidian's native tooltips.
 *
 * The library sets tooltip text on item hover (after the pointer is already over
 * the element), so Obsidian's hover-based setTooltip is unreliable. Instead we
 * display the tooltip immediately, and hide it when the library clears the
 * element's `title` (its hide mechanism).
 */

const TOOLTIP_OFFSET_Y = 12;
const pointer = { x: 0, y: 0 };
const trackedDocs = new WeakSet<Document>();
let doc: Document = activeDocument;
let proxyEl: HTMLElement | null = null;
let tooltipEl: HTMLElement | null = null;
// kind "item": a real event/point element. kind "panel": the shared timeline
// panel, which the library uses as the hover target for periods.
let shown: {
	el: Element;
	itemEl: Element | null;
	text: string;
	kind: "item" | "panel";
} | null = null;

const FOREGROUND_ITEM = ".vis-item:not(.vis-background)";

// Points nest their dot inside the item element, so resolve to the outermost item
function foregroundItemOf(el: Element | null): Element | null {
	let item = el?.closest(FOREGROUND_ITEM) ?? null;
	while (item?.parentElement?.closest(FOREGROUND_ITEM)) {
		item = item.parentElement.closest(FOREGROUND_ITEM);
	}
	return item;
}

function foregroundItemUnderPointer(): Element | null {
	return foregroundItemOf(doc.elementFromPoint(pointer.x, pointer.y));
}

// Track per document, since a view may live in a popout window
function trackPointer(target: Document) {
	doc = target;
	if (trackedDocs.has(target)) return;
	trackedDocs.add(target);
	// mouseover fires before mousemove, so track both to keep the position fresh
	(["mousemove", "mouseover"] as const).forEach((type) =>
		target.addEventListener(
			type,
			(e: MouseEvent) => {
				doc = target;
				pointer.x = e.clientX;
				pointer.y = e.clientY;
				// The library's own hide calls don't reliably fire when leaving an item
				// (they target child elements), so close an item tooltip once the
				// pointer is no longer over that item
				if (shown?.kind === "item") {
					if (foregroundItemUnderPointer() !== shown.itemEl)
						hideTooltip();
				}
				moveTooltip();
			},
			{ capture: true, passive: true },
		),
	);
}

// Obsidian positions a tooltip once, so reposition it ourselves to follow the pointer
function moveTooltip() {
	if (!tooltipEl?.isConnected) return;
	// Place at the pointer, then measure and shift by however far the tooltip's
	// own CSS (ex: a centering transform) moved it from the pointer
	tooltipEl.setCssProps({
		left: `${pointer.x}px`,
		top: `${pointer.y + TOOLTIP_OFFSET_Y}px`,
	});
	const rect = tooltipEl.getBoundingClientRect();
	const shift = pointer.x - (rect.left + rect.width / 2);
	tooltipEl.setCssProps({
		left: `${Math.max(0, pointer.x + shift)}px`,
	});
}

function hideTooltip() {
	proxyEl?.remove();
	proxyEl = null;
	tooltipEl = null;
	shown = null;
	doc.body
		.findAll(":scope > .tooltip")
		.forEach((tooltipEl) => tooltipEl.remove());
}

// "[[path/to/note]]" is dropped and "[[path|Alias]]" shows just "Alias"
function stripWikiLinks(text: string): string {
	return text
		.replace(/\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g, (_m, _path, alias) =>
			alias ? alias.trim() : "",
		)
		.replace(/[ \t]+\n/g, "\n")
		.replace(/\n\s*$/, "")
		.trim();
}

export function obsidianTooltip(el: Element, rawText: string): void {
	if (!el.instanceOf(HTMLElement)) return;
	const text = stripWikiLinks(rawText);
	trackPointer(el.ownerDocument);

	// Not a hover target the library clears (ex: the refit button)
	if (!el.closest(".vis-item, .vis-panel")) {
		setTooltip(el, text);
		return;
	}

	// The library passes whichever child element was hovered, so identify items
	// by their .vis-item ancestor
	const itemEl = foregroundItemOf(el);
	const kind = itemEl ? "item" : "panel";

	// A period (panel) tooltip must never replace the tooltip of an event or point
	// stacked on top of it
	if (kind === "panel" && foregroundItemUnderPointer()) return;

	if (!el.dataset.chronosTooltipWired) {
		el.dataset.chronosTooltipWired = "true";
		const removeAttribute = el.removeAttribute.bind(el);
		el.removeAttribute = (name: string) => {
			removeAttribute(name);
			// A stale clear (ex: the period panel clearing as the pointer moves onto an
			// event stacked on top of it) must not close the newer tooltip
			// Item tooltips are closed by the pointer check above (the library's own
			// clears can fire while the pointer is still over the item)
			if (
				name === "title" &&
				shown?.kind === "panel" &&
				shown.el === el
			) {
				hideTooltip();
			}
		};
	}

	// The hover target for periods changes between child elements while the text
	// stays the same, so don't redisplay (but track the latest target for clears)
	if (
		shown?.kind === kind &&
		shown.text === text &&
		shown.itemEl === itemEl
	) {
		shown.el = el;
		return;
	}
	hideTooltip();
	shown = { el, itemEl, text, kind };

	// Items (especially wide periods) and the shared timeline panel are large, so
	// anchor the tooltip to a tiny element just below the pointer instead
	proxyEl = doc.body.createDiv({ cls: "chronos-tooltip-anchor" });
	proxyEl.setCssProps({
		"--chronos-tooltip-x": `${pointer.x}px`,
		"--chronos-tooltip-y": `${pointer.y + TOOLTIP_OFFSET_Y}px`,
	});
	displayTooltip(proxyEl, text, { placement: "bottom" });
	tooltipEl = doc.body.findAll(":scope > .tooltip").pop() ?? null;
	moveTooltip();
}
