import {
	Editor,
	MarkdownPostProcessorContext,
	MarkdownView,
	Notice,
} from "obsidian";

export interface TimelineEditSnapshot {
	editor: Editor;
	view: MarkdownView;
	path: string;
	document: string;
	markdown: string;
	startLine: number;
	endLine: number;
	linePrefix: string;
}

export function findTimelineBody(
	document: string,
	lineStart: number,
	lineEnd: number,
	source: string,
): {
	startLine: number;
	endLine: number;
	markdown: string;
	linePrefix: string;
} | null {
	const lines = document.split("\n");
	if (lineStart < 0 || lineEnd >= lines.length || lineEnd <= lineStart) {
		return null;
	}
	const opening = lines[lineStart].match(
		/^((?: {0,3}> ?)* {0,3})(`{3,}|~{3,})[ \t]*chronos[ \t]*$/i,
	);
	if (!opening) return null;
	const [, linePrefix, fence] = opening;
	if (!lines[lineEnd].startsWith(linePrefix)) return null;
	const closing = lines[lineEnd].slice(linePrefix.length).trim();
	if (
		closing.length < fence.length ||
		![...closing].every((character) => character === fence[0])
	) {
		return null;
	}
	const bodyLines = lines.slice(lineStart + 1, lineEnd);
	if (bodyLines.some((line) => line !== "" && !line.startsWith(linePrefix))) {
		return null;
	}
	const markdown = bodyLines
		.map((line) => line.slice(linePrefix.length))
		.join("\n");
	if (markdown !== source.replace(/\r\n/g, "\n").replace(/\n$/, "")) {
		return null;
	}
	return { startLine: lineStart + 1, endLine: lineEnd, markdown, linePrefix };
}

export function captureTimelineEdit(
	view: MarkdownView,
	context: MarkdownPostProcessorContext,
	el: HTMLElement,
	source: string,
): TimelineEditSnapshot {
	if (!view.file || view.file.path !== context.sourcePath) {
		throw new Error(
			"Open the timeline's source note before editing it with AI.",
		);
	}
	const section = context.getSectionInfo(el);
	if (!section) {
		throw new Error("Could not locate this timeline in its source note.");
	}
	const editor = view.editor;
	const document = editor.getValue();
	const block = findTimelineBody(
		document,
		section.lineStart,
		section.lineEnd,
		source,
	);
	if (!block) {
		throw new Error(
			"Could not safely locate this timeline's markdown. Open the source note and try again.",
		);
	}
	return { editor, view, path: context.sourcePath, document, ...block };
}

export function applyTimelineEdit(
	snapshot: TimelineEditSnapshot,
	markdown: string,
): void {
	if (
		snapshot.view.file?.path !== snapshot.path ||
		snapshot.view.editor !== snapshot.editor ||
		snapshot.editor.getValue() !== snapshot.document
	) {
		throw new Error(
			"The note changed while AI was working. No changes were applied; please try again.",
		);
	}
	if (/^ {0,3}(?:`{3,}|~{3,})/m.test(markdown)) {
		throw new Error(
			"The proposed markdown contains a code fence. No changes were applied.",
		);
	}
	snapshot.editor.replaceRange(
		`${markdown
			.split("\n")
			.map((line) => snapshot.linePrefix + line)
			.join("\n")}\n`,
		{ line: snapshot.startLine, ch: 0 },
		{ line: snapshot.endLine, ch: 0 },
	);
}

export function openNativeTimelineEditor(el: HTMLElement): void {
	const block =
		el.closest(".cm-preview-code-block.cm-lang-chronos") ??
		el.closest(".block-language-chronos");
	const button =
		block?.querySelector<HTMLElement>(".edit-block-button") ??
		(block?.nextElementSibling?.matches(".edit-block-button")
			? block.nextElementSibling
			: null);
	if (button?.instanceOf(HTMLElement)) {
		button.click();
	} else {
		new Notice("Could not find the timeline's edit button.");
	}
}
