import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { globalIgnores, defineConfig } from "eslint/config";

export default defineConfig([
	globalIgnores([
		"node_modules",
		"dist",
		"esbuild.config.mjs",
		"version-bump.mjs",
		"versions.json",
		"main.js",
		"package.json",
		"package-lock.json",
		"tsconfig.json",
	]),
	...obsidianmd.configs.recommended,
	{
		files: ["**/*.ts"],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: { project: "./tsconfig.json" },
			globals: globals.browser,
		},
		// i THINK these are ignored by obsidian scorecard?
		rules: {
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-return": "off",
			"eslint-comments/no-restricted-disable": "off",
			"obsidianmd/ui/sentence-case": [
				"warn",
				{
					brands: [
						"Chronos",
						"Chronos Timeline",
						"Bases",
						"What's New in Chronos Timeline",
						"Obsidian",
						"Anthropic",
						"OpenAI",
						"LMStudio",
						"API",
					],
				},
			],
		},
	},
]);
