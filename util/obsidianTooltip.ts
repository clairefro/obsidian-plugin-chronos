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
let tracking = false;
let proxyEl: HTMLElement | null = null;
let tooltipEl: HTMLElement | null = null;
let shown: { el: Element; text: string } | null = null;

function trackPointer() {
	if (tracking) return;
	tracking = true;
	// mouseover fires before mousemove, so track both to keep the position fresh
	["mousemove", "mouseover"].forEach((type) =>
		window.addEventListener(
			type,
			(e: MouseEvent) => {
				pointer.x = e.clientX;
				pointer.y = e.clientY;
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
	activeDocument.body
		.findAll(":scope > .tooltip")
		.forEach((tooltipEl) => tooltipEl.remove());
}

export function obsidianTooltip(el: Element, text: string): void {
	if (!el.instanceOf(HTMLElement)) return;
	trackPointer();

	// Not a hover target the library clears (ex: the refit button)
	if (!el.closest(".vis-item, .vis-panel")) {
		setTooltip(el, text);
		return;
	}

	if (!el.dataset.chronosTooltipWired) {
		el.dataset.chronosTooltipWired = "true";
		const removeAttribute = el.removeAttribute.bind(el);
		el.removeAttribute = (name: string) => {
			removeAttribute(name);
			// A stale clear (ex: the period panel clearing as the pointer moves onto an
			// event stacked on top of it) must not close the newer tooltip
			if (name === "title" && shown?.el === el) hideTooltip();
		};
	}

	if (shown?.el === el && shown.text === text) return;
	hideTooltip();
	shown = { el, text };

	// Items (especially wide periods) and the shared timeline panel are large, so
	// anchor the tooltip to a tiny element just below the pointer instead
	proxyEl = activeDocument.body.createDiv({ cls: "chronos-tooltip-anchor" });
	proxyEl.setCssProps({
		"--chronos-tooltip-x": `${pointer.x}px`,
		"--chronos-tooltip-y": `${pointer.y + TOOLTIP_OFFSET_Y}px`,
	});
	displayTooltip(proxyEl, text, { placement: "bottom" });
	tooltipEl = activeDocument.body.findAll(":scope > .tooltip").pop() ?? null;
	moveTooltip();
}
