// Bundles the AI modules for Node (with `obsidian` stubbed) and runs node:test
import esbuild from "esbuild";
import { spawnSync } from "node:child_process";

const obsidianStub = {
	name: "obsidian-stub",
	setup(build) {
		build.onResolve({ filter: /^obsidian$/ }, () => ({
			path: "obsidian",
			namespace: "obsidian-stub",
		}));
		build.onLoad({ filter: /.*/, namespace: "obsidian-stub" }, () => ({
			// records requests so tests can assert on what would be sent
			contents: `export async function requestUrl(req) {
				(globalThis.__requests ||= []).push(req);
				return { json: { choices: [{ message: { content: "ok" } }], data: [] } };
			}`,
			loader: "js",
		}));
	},
};

await esbuild.build({
	entryPoints: {
		endpoint: "lib/ai/endpoint.ts",
		openAICompatible: "lib/ai/providers/openAICompatible.ts",
	},
	bundle: true,
	platform: "node",
	format: "esm",
	outdir: "test/.build",
	outExtension: { ".js": ".mjs" },
	plugins: [obsidianStub],
	logLevel: "error",
});

const result = spawnSync(
	process.execPath,
	["--test", "test/endpoint.test.mjs", "test/openAICompatible.test.mjs"],
	{
		stdio: "inherit",
	},
);
process.exit(result.status ?? 1);
