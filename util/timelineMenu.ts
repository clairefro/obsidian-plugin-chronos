import { Menu, Notice, setIcon, setTooltip } from "obsidian";
import LZString from "lz-string";
import { CHRONOS_PLAYGROUND_BASE_URL } from "../constants";
import { ChronosPluginSettings } from "../types";

const SVG_NS = "http://www.w3.org/2000/svg";
const XHTML_NS = "http://www.w3.org/1999/xhtml";
const PNG_SCALE = 2;
// UI that belongs to the plugin or library chrome, not the timeline itself
const EXPORT_EXCLUDED = [
	".chronos-timeline-menu",
	".chronos-width-toggle",
	".chronos-timeline-refit-button",
];

const WIKILINK_RE = /\[\[.*?\]\]/g;

const hasLinks = (markdown: string) => /\[\[.*?\]\]/.test(markdown);

/** Remove [[wikilinks]] (meaningless outside Obsidian), tidying empty trailing descriptions. */
export function stripWikilinks(markdown: string): string {
	return markdown
		.replace(WIKILINK_RE, "")
		.trim()
		.split("\n")
		.map((line) => line.replace(/\|\s*$/, ""))
		.join("\n");
}

/** Build a Chronos playground link for the given timeline markdown. */
export function buildPlaygroundUrl(
	markdown: string,
	locale?: string,
	omitLinks = true,
): string {
	const content = omitLinks ? stripWikilinks(markdown) : markdown.trim();

	const url = new URL(CHRONOS_PLAYGROUND_BASE_URL);
	url.search = "";

	if (content.trim()) {
		try {
			// compressed value expected by the playground
			url.searchParams.set(
				"content",
				LZString.compressToEncodedURIComponent(content),
			);
			url.searchParams.set("c", "1");
		} catch {
			url.searchParams.set("content", content);
		}
	}

	if (locale && locale !== "en") {
		url.searchParams.set("locale", locale);
	}

	return url.toString();
}

async function copyMarkdown(markdown: string) {
	try {
		await navigator.clipboard.writeText(markdown);
		new Notice("Timeline markdown copied!");
	} catch {
		new Notice("Failed to copy timeline markdown");
	}
}

/** Copy the timeline's playground link to the clipboard, with user feedback. */
export async function copyShareableLink(
	markdown: string,
	settings: ChronosPluginSettings,
	omitLinks = true,
) {
	try {
		await navigator.clipboard.writeText(
			buildPlaygroundUrl(markdown, settings.selectedLocale, omitLinks),
		);
		new Notice("Shareable public link copied to clipboard!");
	} catch {
		new Notice("Failed to create shareable link");
	}
}

/**
 * Adds a "..." button (visible on timeline hover) to the lower left corner of a
 * timeline container. It opens a menu with export and share actions.
 */
export function attachTimelineMenu(
	container: HTMLElement,
	getMarkdown: () => string,
	settings: ChronosPluginSettings,
	editActions?: {
		editMarkdown: () => void;
		editMarkdownWithAI: () => void;
	},
) {
	const button = container.createEl("button", {
		cls: "chronos-timeline-menu",
	});
	setIcon(button, "ellipsis");
	setTooltip(button, "Timeline options");

	button.addEventListener(
		"click",
		(e) => {
			e.stopPropagation();
			e.stopImmediatePropagation();
			e.preventDefault();

			const menu = new Menu();
			menu.addItem((item) =>
				item
					.setTitle("Export as PNG")
					.setIcon("image")
					.onClick(() => void exportTimeline(container, "png")),
			);
			menu.addItem((item) =>
				item
					.setTitle("Export as SVG")
					.setIcon("file-code")
					.onClick(() => void exportTimeline(container, "svg")),
			);
			menu.addSeparator();
			const markdown = getMarkdown();
			const withLinks = hasLinks(markdown);
			const suffix = withLinks ? " (omit my links)" : "";
			menu.addItem((item) =>
				item
					.setTitle("Copy markdown")
					.setIcon("copy")
					.onClick(() => void copyMarkdown(markdown)),
			);
			if (withLinks) {
				menu.addItem((item) =>
					item
						.setTitle(`Copy markdown${suffix}`)
						.setIcon("copy")
						.onClick(
							() => void copyMarkdown(stripWikilinks(markdown)),
						),
				);
			}
			if (editActions) {
				menu.addSeparator();
				menu.addItem((item) =>
					item
						.setTitle("Edit markdown")
						.setIcon("pencil")
						.onClick(editActions.editMarkdown),
				);
				if (settings.useAI) {
					menu.addItem((item) =>
						item
							.setTitle("Edit markdown with AI")
							.setIcon("sparkles")
							.onClick(editActions.editMarkdownWithAI),
					);
				}
			}
			menu.addSeparator();
			menu.addItem((item) =>
				item
					.setTitle("Copy shareable link")
					.setIcon("share-2")
					.onClick(
						() => void copyShareableLink(markdown, settings, false),
					),
			);
			if (withLinks) {
				menu.addItem((item) =>
					item
						.setTitle(`Copy shareable link${suffix}`)
						.setIcon("share-2")
						.onClick(
							() =>
								void copyShareableLink(
									markdown,
									settings,
									true,
								),
						),
				);
			}
			menu.showAtMouseEvent(e);
		},
		true,
	);
}

// Copy resolved styles onto the clone so it renders the same outside the document.
function inlineStyles(source: Element, target: Element) {
	const computed = getComputedStyle(source);
	const style = (target as HTMLElement).style;
	if (style) {
		for (let i = 0; i < computed.length; i++) {
			const prop = computed[i];
			style.setProperty(
				prop,
				computed.getPropertyValue(prop),
				computed.getPropertyPriority(prop),
			);
		}
	}
	const sourceChildren = source.children;
	const targetChildren = target.children;
	for (let i = 0; i < sourceChildren.length; i++) {
		inlineStyles(sourceChildren[i], targetChildren[i]);
	}
}

function buildSvg(container: HTMLElement): {
	svg: string;
	width: number;
	height: number;
} {
	const { width, height } = container.getBoundingClientRect();
	const clone = container.cloneNode(true) as HTMLElement;
	inlineStyles(container, clone);
	for (const selector of EXPORT_EXCLUDED) {
		clone.querySelectorAll(selector).forEach((el) => el.remove());
	}

	// the container's own layout is set by the page, pin it to what is on screen
	clone.setCssProps({
		margin: "0",
		width: `${width}px`,
		height: `${height}px`,
	});
	clone.setAttribute("xmlns", XHTML_NS);

	const background =
		getComputedStyle(container).backgroundColor ||
		getComputedStyle(document.body).getPropertyValue(
			"--background-primary",
		);
	clone.style.backgroundColor = background;

	const xhtml = new XMLSerializer().serializeToString(clone);
	const svg =
		`<svg xmlns="${SVG_NS}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
		`<foreignObject width="100%" height="100%">${xhtml}</foreignObject></svg>`;
	return { svg, width, height };
}

function download(blob: Blob, filename: string) {
	const url = URL.createObjectURL(blob);
	const a = createEl("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function svgToPng(svg: string, width: number, height: number): Promise<Blob> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => {
			const canvas = createEl("canvas");
			canvas.width = width * PNG_SCALE;
			canvas.height = height * PNG_SCALE;
			const ctx = canvas.getContext("2d");
			if (!ctx) return reject(new Error("Canvas not supported"));
			ctx.scale(PNG_SCALE, PNG_SCALE);
			ctx.drawImage(img, 0, 0, width, height);
			canvas.toBlob(
				(blob) =>
					blob
						? resolve(blob)
						: reject(new Error("PNG encoding failed")),
				"image/png",
			);
		};
		img.onerror = () =>
			reject(new Error("Could not render timeline image"));
		img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
	});
}

async function exportTimeline(container: HTMLElement, format: "png" | "svg") {
	try {
		const { svg, width, height } = buildSvg(container);
		const stamp = new Date()
			.toISOString()
			.slice(0, 19)
			.replace(/[-:T]/g, "");
		const filename = `chronos-timeline-${stamp}.${format}`;
		const blob =
			format === "svg"
				? new Blob([svg], { type: "image/svg+xml" })
				: await svgToPng(svg, width, height);
		download(blob, filename);
	} catch (e) {
		console.error("[Chronos] Export failed", e);
		new Notice(`Failed to export timeline as ${format.toUpperCase()}`);
	}
}
