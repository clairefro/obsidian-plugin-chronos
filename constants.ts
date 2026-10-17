import { BasePropNames } from "./types";

const DEFAULT_LOCALE = "en";

const PROVIDER_DEFAULT_MODELS: Record<string, string> = {
	openai: "gpt-6-luna",
	gemini: "gemini-2.5-flash",
	anthropic: "claude-haiku-5-5",
	openrouter: "openai/gpt-4o-mini",
	ollama: "",
	lmstudio: "",
};

const PROVIDER_DEFAULT_BASE_URLS: Record<string, string> = {
	openrouter: "https://openrouter.ai/api/v1",
	ollama: "http://localhost:11434/v1",
	lmstudio: "http://localhost:1234/v1",
};

const OPENAI_MODEL = PROVIDER_DEFAULT_MODELS.openai;
const PEPPER = "drpepper";

const DETECTION_PATTERN_TEXT = /`+chronos\s+(.*?)`+/gi;
const DETECTION_PATTERN_HTML = /^chronos\s+(.*?)$/i;
const DETECTION_PATTERN_CODEBLOCK = /```chronos\s*\n([\s\S]*?)```/gi;

const BASES_PROP_NAMES_DEFAULTS: BasePropNames = {
	start: "start",
	end: "end",
	group: "group",
	color: "color",
	type: "type",
	content: "content",
	description: "description",
};

const CHRONOS_PLAYGROUND_BASE_URL =
	"https://clairefro.github.io/chronos-timeline-md";

export {
	DEFAULT_LOCALE,
	PROVIDER_DEFAULT_MODELS,
	PROVIDER_DEFAULT_BASE_URLS,
	OPENAI_MODEL,
	PEPPER,
	DETECTION_PATTERN_TEXT,
	DETECTION_PATTERN_HTML,
	DETECTION_PATTERN_CODEBLOCK,
	CHRONOS_PLAYGROUND_BASE_URL,
	BASES_PROP_NAMES_DEFAULTS,
};
