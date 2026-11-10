import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { transform } from "esbuild";

const source = await readFile(
	new URL("../util/changelog.ts", import.meta.url),
	"utf8",
);
const { code } = await transform(source, { loader: "ts", format: "esm" });
const { getUnseenChangelogs } = await import(
	`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
);

function release(tag, body = "Release notes", date = "2026-01-01T00:00:00Z") {
	return { tag_name: tag, body, published_at: date };
}

test("ignores patch releases without include markers, including version suffixes", () => {
	const releases = [
		release("5.1.1"),
		release("v5.1.2", ""),
		release("5.1.3", "Important notes"),
		release("5.1.4-beta.1"),
		release("5.1.5"),
	];
	assert.deepEqual(getUnseenChangelogs(releases, "5.1.0", "5.1.5"), []);
});

test("includes marked patches and removes the invisible marker from notes", () => {
	const releases = [
		release(
			"v5.1.1",
			"<!-- include -->\n## What's new\nDetails",
			"2026-01-02T00:00:00Z",
		),
		release("5.1.2", "  <!-- INCLUDE -->  ", "2026-01-01T00:00:00Z"),
	];
	const entries = getUnseenChangelogs(releases, "5.1.0", "5.1.2");
	assert.deepEqual(
		entries.map((entry) => entry.version),
		["5.1.1", "5.1.2"],
	);
	assert.equal(entries[0].content, "\n## What's new\nDetails");
	assert.equal(entries[1].content, "No release notes available.");
});

test("includes a marked patch with a version suffix", () => {
	const entries = getUnseenChangelogs(
		[release("5.1.4-beta.1", "<!-- include -->\nNotes")],
		"5.1.0",
		"5.1.4-beta.1",
	);
	assert.equal(entries.length, 1);
	assert.equal(entries[0].version, "5.1.4-beta.1");
});

test("announces missed eligible releases when updating to a normal patch", () => {
	const releases = [
		release("v5.1.0", "Minor notes", "2026-01-02T00:00:00Z"),
		release("5.0.0", "Major notes", "2026-01-01T00:00:00Z"),
		release("5.1.1", "Patch notes"),
		release(
			"5.0.1",
			"<!-- include -->\nEarlier patch notes",
			"2026-01-01T12:00:00Z",
		),
		release("5.2.0", "Future notes"),
		release("4.9.0", "Already seen"),
	];
	const expected = ["5.1.0", "5.0.1", "5.0.0"];
	assert.deepEqual(
		getUnseenChangelogs(releases, "4.9.0", "5.1.1").map(
			(entry) => entry.version,
		),
		expected,
	);
	assert.deepEqual(
		getUnseenChangelogs(releases, "0.0.0", "5.1.1").map(
			(entry) => entry.version,
		),
		[...expected, "4.9.0"],
	);
});

test("announces missed releases even if the current patch release is unavailable", () => {
	assert.deepEqual(
		getUnseenChangelogs([release("5.1.0")], "5.0.0", "5.1.1").map(
			(entry) => entry.version,
		),
		["5.1.0"],
	);
});

test("a marked current patch can announce missed major and minor releases", () => {
	const releases = [
		release("v5.1.0", "Minor notes", "2026-01-02T00:00:00Z"),
		release("5.0.0", "Major notes", "2026-01-01T00:00:00Z"),
		release(
			"5.1.1",
			"<!-- include -->\nPatch notes",
			"2026-01-03T00:00:00Z",
		),
	];
	assert.deepEqual(
		getUnseenChangelogs(releases, "4.9.0", "5.1.1").map(
			(entry) => entry.version,
		),
		["5.1.1", "5.1.0", "5.0.0"],
	);
});

test("major and minor releases trigger announcements without include markers", () => {
	const releases = [release("5.0.0"), release("5.1.0"), release("5.1.1")];
	assert.deepEqual(
		getUnseenChangelogs(releases, "4.9.0", "5.0.0").map(
			(entry) => entry.version,
		),
		["5.0.0"],
	);
	assert.deepEqual(
		getUnseenChangelogs(releases, "5.0.0", "5.1.0").map(
			(entry) => entry.version,
		),
		["5.1.0"],
	);
	assert.deepEqual(getUnseenChangelogs(releases, "5.1.0", "5.1.1"), []);
});

test("limits the newest eligible releases and preserves empty-note fallback", () => {
	const releases = [1, 2, 3, 4, 5].map((minor) =>
		release(
			`1.${minor}.0`,
			minor === 5 ? null : "Notes",
			`2026-01-0${minor}T00:00:00Z`,
		),
	);
	const entries = getUnseenChangelogs(releases, "0.0.0", "1.5.0");
	assert.deepEqual(
		entries.map((entry) => entry.version),
		["1.5.0", "1.4.0", "1.3.0", "1.2.0"],
	);
	assert.equal(entries[0].content, "No release notes available.");
});
