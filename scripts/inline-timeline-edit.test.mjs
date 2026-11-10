import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const state = { menus: [], requests: [], response: {} };
class Notice {
	constructor(message) {
		state.notice = message;
	}
}
class Menu {
	constructor() {
		this.items = [];
		state.menus.push(this);
	}
	addItem(callback) {
		const item = {
			setTitle(title) {
				this.title = title;
				return this;
			},
			setIcon() {
				return this;
			},
			onClick(callback) {
				this.callback = callback;
				return this;
			},
		};
		callback(item);
		this.items.push(item);
	}
	addSeparator() {}
	showAtMouseEvent() {}
}
class TestElement {
	constructor() {
		this.children = [];
		this.listeners = {};
		this.value = "";
	}
	createEl(tag, options = {}) {
		const child = new TestElement();
		child.tag = tag;
		child.text = options.text;
		child.cls = options.cls;
		child.parent = this;
		child.attrs = options.attr ?? {};
		this.children.push(child);
		return child;
	}
	createDiv(options) {
		return this.createEl("div", options);
	}
	createSpan(options) {
		return this.createEl("span", options);
	}
	appendText(text) {
		this.children.push({ text });
	}
	get innerText() {
		return (
			this._innerText ??
			this.children.map((child) => child.text).join("\n")
		);
	}
	set innerText(value) {
		this._innerText = value;
	}
	addEventListener(event, callback) {
		this.listeners[event] = callback;
	}
	setText(text) {
		this.text = text;
	}
	setAttribute(name, value) {
		this.attrs ??= {};
		this.attrs[name] = value;
	}
	appendChild(child) {
		child.parent = this;
		this.children.push(child);
	}
	remove() {
		this.parent.children = this.parent.children.filter(
			(child) => child !== this,
		);
	}
	focus() {}
	empty() {
		this.children = [];
		this._innerText = undefined;
	}
}
class Modal {
	constructor() {
		this.contentEl = new TestElement();
	}
	setTitle() {}
	close() {
		this.onClose();
	}
}
class Setting {
	constructor() {
		this.buttons = [];
		this.controlEl = new TestElement();
		this.controlEl.addClass = () => {};
		state.controls = this;
	}
	addButton(callback) {
		const button = {
			buttonEl: new TestElement(),
			setButtonText(text) {
				this.text = text;
				return this;
			},
			setCta() {
				return this;
			},
			setDisabled(disabled) {
				this.disabled = disabled;
				return this;
			},
			onClick(callback) {
				this.click = callback;
				return this;
			},
		};
		this.buttons.push(button);
		callback(button);
	}
}
globalThis.__chronosTestObsidian = {
	Notice,
	Menu,
	Modal,
	Setting,
	setIcon() {},
	setTooltip() {},
	requestUrl: async (request) => {
		state.requests.push(request);
		return { status: 200, json: state.response };
	},
};

async function load(path) {
	const result = await build({
		entryPoints: [path],
		bundle: true,
		platform: "node",
		format: "esm",
		write: false,
		plugins: [
			{
				name: "obsidian-test-mock",
				setup(builder) {
					builder.onResolve({ filter: /^obsidian$/ }, () => ({
						path: "obsidian",
						namespace: "mock",
					}));
					builder.onLoad({ filter: /.*/, namespace: "mock" }, () => ({
						contents:
							"export const { Notice, Menu, Modal, Setting, setIcon, setTooltip, requestUrl } = globalThis.__chronosTestObsidian;",
						loader: "js",
					}));
				},
			},
		],
	});
	return import(
		`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
	);
}

const editing = await load("util/inlineTimelineEditing.ts");
const { attachTimelineMenu } = await load("util/timelineMenu.ts");
const { GenAi } = await load("lib/ai/GenAi.ts");
const { EditTimelineWithAiModal } = await load(
	"components/EditTimelineWithAiModal.ts",
);
const { getChronosLineHighlights, renderHighlightedChronos } = await load(
	"util/chronosHighlight.ts",
);

test("Chronos preview preserves text and uses editor token highlights", () => {
	const source =
		"# comment\n> HEIGHT 300\n- [2020~2021] #blue {Group} Title | [[Note]] & <text>\n\n";
	const container = new TestElement();
	renderHighlightedChronos(container, source);
	assert.equal(
		container.children.map((child) => child.text).join(""),
		source,
	);
	const classes = container.children
		.map((child) => child.cls ?? "")
		.join(" ");
	for (const name of [
		"comment",
		"directive",
		"flag",
		"item-marker",
		"date",
		"date-range-separator",
		"color",
		"group",
		"separator",
		"description",
		"link",
	]) {
		assert(classes.includes(`cm-chronos-${name}`), `Missing ${name}`);
	}
	const ranges = getChronosLineHighlights("  * [2020~2021] title | [[Note]]");
	assert(
		ranges.some(
			(range) =>
				range.className === "cm-chronos-item-marker" &&
				range.from === 2,
		),
	);
	assert(
		ranges.some(
			(range) => range.className === "cm-chronos-date-range-separator",
		),
	);
});

function makeEditor(document) {
	return {
		document,
		getValue() {
			return this.document;
		},
		replaceRange(replacement, from, to) {
			const lines = this.document.split("\n");
			lines.splice(
				from.line,
				to.line - from.line,
				...replacement.slice(0, -1).split("\n"),
			);
			this.document = lines.join("\n");
		},
	};
}

test("targets the correct block and preserves surrounding note and fence", () => {
	const document =
		"before\n```chronos\n- [2020] One\n```\nbetween\n```chronos\n- [2021] Two\n```\nafter";
	const editor = makeEditor(document);
	const view = { file: { path: "note.md" }, editor };
	const context = {
		sourcePath: "note.md",
		getSectionInfo: () => ({ lineStart: 5, lineEnd: 7 }),
	};
	const snapshot = editing.captureTimelineEdit(
		view,
		context,
		{},
		"- [2021] Two\n",
	);
	editing.applyTimelineEdit(snapshot, "- [2021] Changed\n* [2022] Added");
	assert.equal(
		editor.document,
		document.replace("- [2021] Two", "- [2021] Changed\n* [2022] Added"),
	);
});

test("rejects stale notes, mismatched source, unsafe fences, and wrong files", () => {
	const document = "```chronos\n- [2020] One\n```";
	const editor = makeEditor(document);
	const view = { file: { path: "note.md" }, editor };
	const context = {
		sourcePath: "note.md",
		getSectionInfo: () => ({ lineStart: 0, lineEnd: 2 }),
	};
	assert.throws(
		() => editing.captureTimelineEdit(view, context, {}, "- [2020] Other"),
		/safely locate/,
	);
	assert.throws(
		() =>
			editing.captureTimelineEdit(
				view,
				{ ...context, sourcePath: "other.md" },
				{},
				"- [2020] One",
			),
		/source note/,
	);
	const snapshot = editing.captureTimelineEdit(
		view,
		context,
		{},
		"- [2020] One",
	);
	assert.throws(
		() => editing.applyTimelineEdit(snapshot, "~~~"),
		/code fence/,
	);
	editor.document += "\nchanged elsewhere";
	assert.throws(
		() => editing.applyTimelineEdit(snapshot, "- [2021] Two"),
		/note changed/,
	);
	assert.equal(editor.document, `${document}\nchanged elsewhere`);
});

test("preserves indented and blockquoted fences", () => {
	for (const prefix of ["  ", "> "]) {
		const document = `${prefix}\`\`\`chronos\n${prefix}- [2020] One\n${prefix}\`\`\``;
		const editor = makeEditor(document);
		const view = { file: { path: "note.md" }, editor };
		const context = {
			sourcePath: "note.md",
			getSectionInfo: () => ({ lineStart: 0, lineEnd: 2 }),
		};
		const snapshot = editing.captureTimelineEdit(
			view,
			context,
			{},
			"- [2020] One\n",
		);
		editing.applyTimelineEdit(snapshot, "- [2021] Two\n* [2022] Three");
		assert.equal(
			editor.document,
			`${prefix}\`\`\`chronos\n${prefix}- [2021] Two\n${prefix}* [2022] Three\n${prefix}\`\`\``,
		);
	}
});

test("manual edit invokes the native code-block edit button", () => {
	const oldHTMLElement = globalThis.HTMLElement;
	class FakeElement {
		click() {
			this.clicked = true;
		}
	}
	globalThis.HTMLElement = FakeElement;
	try {
		const button = new FakeElement();
		const block = { querySelector: () => button };
		editing.openNativeTimelineEditor({ closest: () => block });
		assert.equal(button.clicked, true);
		editing.openNativeTimelineEditor({ closest: () => null });
		assert.match(state.notice, /edit button/);
	} finally {
		globalThis.HTMLElement = oldHTMLElement;
	}
});

test("AI proposals can be refined and are compared to the original", async () => {
	const snapshot = {
		markdown: "original",
		document: "note",
		path: "note.md",
		editor: {},
	};
	const requests = [];
	const previews = [];
	const destroyed = [];
	const applied = [];
	const modal = new EditTimelineWithAiModal(
		{},
		() => snapshot,
		async (markdown, request) => {
			requests.push([markdown, request]);
			return `${markdown}: ${request}`;
		},
		(...args) => applied.push(args),
		(_container, markdown) => {
			previews.push(markdown);
			return () => destroyed.push(markdown);
		},
		() => ({ provider: "gemini", model: "gemini-test" }),
	);
	modal.onOpen();
	const input = modal.contentEl.children[0];
	assert.equal(input.attrs["aria-label"], undefined);
	const label = modal.contentEl.children.at(-1);
	assert.equal(input.attrs["aria-labelledby"], label.attrs.id);
	assert.equal(label.text, "Requested changes");
	const review = modal.contentEl.children[3];
	const proposedDetails = review.children[0];
	const diff = proposedDetails.children[1];
	const [generate, apply] = state.controls.buttons;
	assert.equal(proposedDetails.tag, "details");
	assert.equal(proposedDetails.attrs.open, undefined);
	assert.equal(proposedDetails.children[0].text, "Proposed changes");
	assert.equal(
		modal.contentEl.children[4].text,
		"Provider: gemini · Model: gemini-test",
	);
	await generate.click();
	assert.match(state.notice, /Describe/);
	assert.equal(apply.disabled, true);
	input.value = "first";
	input.listeners.input();
	await generate.click();
	assert.equal(review.hidden, false);
	assert.equal(diff.attrs.contenteditable, undefined);
	assert.deepEqual(
		diff.children.map((line) => line.text),
		["- original", "+ original: first"],
	);
	assert.equal(generate.text, "Refine with AI");
	input.value = "second";
	input.listeners.input();
	assert.equal(apply.disabled, false);
	await generate.click();
	assert.deepEqual(requests, [
		["original", "first"],
		["original: first", "second"],
	]);
	assert.deepEqual(previews, ["original: first", "original: first: second"]);
	assert.deepEqual(destroyed, ["original: first"]);
	assert.deepEqual(
		diff.children.map((line) => line.text),
		["- original", "+ original: first: second"],
	);
	apply.click();
	assert.deepEqual(applied, [[snapshot, "original: first: second"]]);
	assert.deepEqual(destroyed, ["original: first", "original: first: second"]);
});

test("AI dialog rejects stale requests while generating", async () => {
	let resolve;
	const promise = new Promise((done) => {
		resolve = done;
	});
	const modal = new EditTimelineWithAiModal(
		{},
		() => ({ markdown: "old" }),
		() => promise,
		() => assert.fail(),
		() => assert.fail(),
		() => ({ provider: "ollama" }),
	);
	modal.onOpen();
	assert.equal(
		modal.contentEl.children[4].text,
		"Provider: ollama · Model: not set",
	);
	const input = modal.contentEl.children[0];
	const [generate, apply, cancel] = state.controls.buttons;
	input.value = "first";
	const pending = generate.click();
	input.value = "second";
	input.listeners.input();
	resolve("result");
	await pending;
	assert.equal(apply.disabled, true);
	assert.match(modal.contentEl.children[2].text, /request changed/i);
	cancel.click();
});

test("failed refinement retains the prior proposal and preview", async () => {
	let calls = 0;
	let destroyed = 0;
	const applied = [];
	const modal = new EditTimelineWithAiModal(
		{},
		() => ({ markdown: "old" }),
		async () => {
			if (++calls === 2) throw new Error("provider error");
			return "new";
		},
		(_snapshot, value) => applied.push(value),
		() => () => destroyed++,
		() => ({ provider: "ollama" }),
	);
	modal.onOpen();
	const input = modal.contentEl.children[0];
	const [generate, apply] = state.controls.buttons;
	input.value = "first";
	await generate.click();
	input.value = "again";
	const originalError = console.error;
	console.error = () => {};
	try {
		await generate.click();
	} finally {
		console.error = originalError;
	}
	assert.equal(destroyed, 0);
	assert.equal(apply.disabled, false);
	assert.match(modal.contentEl.children[2].text, /provider error/);
	apply.click();
	assert.deepEqual(applied, ["new"]);
	assert.equal(destroyed, 1);
});

test("changed note prevents refinement", async () => {
	let document = "old note";
	let calls = 0;
	const editor = {};
	const modal = new EditTimelineWithAiModal(
		{},
		() => ({ markdown: "old", document, editor, path: "note" }),
		async () => {
			calls++;
			return "new";
		},
		() => {},
		() => () => {},
		() => ({ provider: "ollama" }),
	);
	modal.onOpen();
	const input = modal.contentEl.children[0];
	const [generate] = state.controls.buttons;
	input.value = "first";
	await generate.click();
	document = "changed";
	input.value = "second";
	const originalError = console.error;
	console.error = () => {};
	try {
		await generate.click();
	} finally {
		console.error = originalError;
	}
	assert.equal(calls, 1);
	assert.match(modal.contentEl.children[2].text, /note changed/i);
});

test("preview failure retains the previous proposal", async () => {
	let count = 0;
	let destroyed = 0;
	const applied = [];
	const modal = new EditTimelineWithAiModal(
		{},
		() => ({ markdown: "old" }),
		async () => (++count === 1 ? "first" : "second"),
		(_snapshot, value) => applied.push(value),
		(_container, value) => {
			if (value === "second") throw new Error("preview failed");
			return () => destroyed++;
		},
		() => ({ provider: "ollama" }),
	);
	modal.onOpen();
	const input = modal.contentEl.children[0];
	const [generate, apply] = state.controls.buttons;
	input.value = "first";
	await generate.click();
	input.value = "second";
	const oldError = console.error;
	console.error = () => {};
	try {
		await generate.click();
	} finally {
		console.error = oldError;
	}
	assert.equal(destroyed, 0);
	assert.equal(modal.contentEl.children[3].children[2].children.length, 1);
	assert.match(modal.contentEl.children[2].text, /preview failed/);
	apply.click();
	assert.deepEqual(applied, ["first"]);
	assert.equal(destroyed, 1);
});

test("closing the AI dialog ignores an in-flight response", async () => {
	let resolve;
	const promise = new Promise((done) => {
		resolve = done;
	});
	const modal = new EditTimelineWithAiModal(
		{},
		() => ({ markdown: "old" }),
		() => promise,
		() => assert.fail(),
		() => assert.fail(),
		() => ({ provider: "ollama" }),
	);
	modal.onOpen();
	modal.contentEl.children[0].value = "change";
	const [generate, apply, cancel] = state.controls.buttons;
	const pending = generate.click();
	cancel.click();
	resolve("result");
	await pending;
	assert.equal(apply.disabled, true);
});

test("inline menu exposes editing actions, while Bases menu does not", () => {
	function openMenu(settings, actions, markdown = "markdown") {
		const button = {
			addEventListener(_event, callback) {
				this.click = callback;
			},
		};
		const container = { createEl: () => button };
		attachTimelineMenu(container, () => markdown, settings, actions);
		button.click({
			stopPropagation() {},
			stopImmediatePropagation() {},
			preventDefault() {},
		});
		return state.menus.at(-1).items;
	}
	let edited = 0;
	let aiEdited = 0;
	const actions = {
		editMarkdown: () => edited++,
		editMarkdownWithAI: () => aiEdited++,
	};
	const inline = openMenu({ useAI: true }, actions);
	assert.deepEqual(
		inline.map((item) => item.title),
		[
			"Export as PNG",
			"Export as SVG",
			"Copy markdown",
			"Edit markdown",
			"Edit markdown with AI",
			"Copy shareable link",
		],
	);
	assert.deepEqual(
		openMenu({ useAI: true }, actions, "[[note]]").map(
			(item) => item.title,
		),
		[
			"Export as PNG",
			"Export as SVG",
			"Copy markdown",
			"Copy markdown (omit my links)",
			"Edit markdown",
			"Edit markdown with AI",
			"Copy shareable link",
			"Copy shareable link (omit my links)",
		],
	);
	inline.find((item) => item.title === "Edit markdown").callback();
	inline.find((item) => item.title === "Edit markdown with AI").callback();
	assert.equal(edited, 1);
	assert.equal(aiEdited, 1);
	assert(
		!openMenu({ useAI: false }, actions).some(
			(item) => item.title === "Edit markdown with AI",
		),
	);
	assert(
		!openMenu({ useAI: true }).some((item) =>
			item.title.startsWith("Edit markdown"),
		),
	);
});

test("all AI providers receive the edit prompt and original timeline", async () => {
	for (const provider of [
		"openai",
		"gemini",
		"anthropic",
		"openrouter",
		"ollama",
		"lmstudio",
	]) {
		const responseText = "```chronos\n> HEIGHT 300\n- [2020] Edited\n```";
		if (provider === "openai")
			state.response = { output_text: responseText };
		else if (provider === "gemini") state.response = { text: responseText };
		else if (provider === "anthropic")
			state.response = {
				content: [{ type: "text", text: responseText }],
			};
		else
			state.response = {
				choices: [{ message: { content: responseText } }],
			};
		state.requests = [];
		const ai = new GenAi({
			provider,
			apiKey: "test",
			model: "test-model",
			baseUrl: "http://localhost:1234",
		});
		assert.equal(
			await ai.editChronos(
				"> HEIGHT 300\n- [2020] Original",
				"Rename it",
			),
			"> HEIGHT 300\n- [2020] Edited",
		);
		const body = JSON.parse(state.requests[0].body);
		const serialized = JSON.stringify(body);
		assert(serialized.includes("Edit the existing Chronos timeline"));
		assert(serialized.includes("currentMarkdown"));
		assert(serialized.includes("Rename it"));
		assert(serialized.includes("Original"));
	}
});

test("legacy OpenAI and LM Studio native APIs receive the edit prompt", async () => {
	const output = "```chronos\n- [2020] Edited\n```";
	state.response = { choices: [{ message: { content: output } }] };
	state.requests = [];
	const openai = new GenAi({
		provider: "openai",
		apiKey: "test",
		model: "gpt-4o",
	});
	await openai.editChronos("- [2020] Original", "Rename");
	let body = JSON.parse(state.requests[0].body);
	assert.match(
		body.messages[0].content,
		/Edit the existing Chronos timeline/,
	);

	state.response = { output: [{ type: "message", content: output }] };
	state.requests = [];
	const lmstudio = new GenAi({
		provider: "lmstudio",
		model: "gpt-oss",
		baseUrl: "http://localhost:1234/v1",
	});
	await lmstudio.editChronos("- [2020] Original", "Rename");
	body = JSON.parse(state.requests[0].body);
	assert.match(body.system_prompt, /Edit the existing Chronos timeline/);
	assert.match(body.input, /Original/);
});

test("timeline generation still uses its original system prompt", async () => {
	state.response = {
		content: [{ type: "text", text: "```chronos\n- [2020] X\n```" }],
	};
	state.requests = [];
	const ai = new GenAi({
		provider: "anthropic",
		apiKey: "test",
		model: "test",
	});
	await ai.toChronos("Make a timeline");
	const body = JSON.parse(state.requests[0].body);
	assert.match(body.system, /Create a concise timeline/);
});

test("rejects AI responses without a complete standalone Chronos block", async () => {
	const ai = new GenAi({
		provider: "anthropic",
		apiKey: "test",
		model: "test",
	});
	for (const text of [
		"",
		"Here you go:\n```chronos\n- [2020] X\n```",
		"```chronos\n- [2020] X",
		"```chronos\n```\nother\n```",
	]) {
		state.response = { content: [{ type: "text", text }] };
		await assert.rejects(() => ai.editChronos("old", "change"));
	}
});
