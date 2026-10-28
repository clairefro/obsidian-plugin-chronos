// Local lint wrapper: runs ESLint but ignores problems inside blocks wrapped by
//   // chronos-lint-ignore-start
//   // chronos-lint-ignore-end
// These are plain comments, not ESLint directives. In --fix mode the marked
// blocks are restored exactly as written, so they are never auto-edited.
//
// Usage: node scripts/lint.mjs [--fix] [paths...]   (defaults to ".")

import { readFileSync } from "node:fs";
import process from "node:process";
import { ESLint } from "eslint";

const START = "chronos-lint-ignore-start";
const END = "chronos-lint-ignore-end";

const args = process.argv.slice(2);
const fix = args.includes("--fix");
const targets = args.filter((a) => a !== "--fix");

// 0-based inclusive [start, end] line index pairs, markers included
function findBlocks(text) {
	const lines = text.split("\n");
	const blocks = [];
	let open = null;
	lines.forEach((line, i) => {
		if (line.includes(START) && open === null) open = i;
		else if (line.includes(END) && open !== null) {
			blocks.push([open, i]);
			open = null;
		}
	});
	return blocks;
}

function restoreBlocks(original, fixed) {
	const before = findBlocks(original);
	const after = findBlocks(fixed);
	if (!before.length || before.length !== after.length) return fixed;
	const origLines = original.split("\n");
	const lines = fixed.split("\n");
	// Replace from the bottom so earlier indexes stay valid
	for (let i = after.length - 1; i >= 0; i--) {
		lines.splice(
			after[i][0],
			after[i][1] - after[i][0] + 1,
			...origLines.slice(before[i][0], before[i][1] + 1),
		);
	}
	return lines.join("\n");
}

const eslint = new ESLint({ fix });
const results = await eslint.lintFiles(targets.length ? targets : ["."]);

for (const result of results) {
	let original = null;
	try {
		original = readFileSync(result.filePath, "utf8");
	} catch {
		continue;
	}
	const linted = result.output ?? original;
	const blocks = findBlocks(linted);

	if (blocks.length) {
		const inBlock = (m) =>
			blocks.some(([s, e]) => m.line - 1 >= s && m.line - 1 <= e);
		result.messages = result.messages.filter((m) => !inBlock(m));
		result.errorCount = result.messages.filter(
			(m) => m.severity === 2,
		).length;
		result.warningCount = result.messages.filter(
			(m) => m.severity === 1,
		).length;
		result.fixableErrorCount = 0;
		result.fixableWarningCount = 0;
	}

	if (fix && result.output !== undefined) {
		result.output = restoreBlocks(original, result.output);
		if (result.output === original) delete result.output;
	}
}

if (fix) await ESLint.outputFixes(results);

const formatter = await eslint.loadFormatter("stylish");
const text = await formatter.format(results);
if (text) process.stdout.write(text + "\n");

const errors = results.reduce((n, r) => n + r.errorCount, 0);
process.exit(errors > 0 ? 1 : 0);
