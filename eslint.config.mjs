import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { defineConfig } from "eslint/config";

export default defineConfig([
	{
		ignores: [
			"main.js",
			"node_modules/**",
			"esbuild.config.mjs",
			"version-bump.mjs",
			"eslint.config.mjs",
		],
	},
	...obsidianmd.configs.recommended,
	{
		files: ["**/*.ts"],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: { project: "./tsconfig.json" },
			globals: globals.browser,
		},
	},
]);
