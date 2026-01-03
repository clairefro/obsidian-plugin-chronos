const DEFAULT_LOCALE = "en";

const PROVIDER_DEFAULT_MODELS: Record<string, string> = {
	openai: "gpt-4o-mini",
	gemini: "gemini-2.5-flash",
};

const OPENAI_MODEL = PROVIDER_DEFAULT_MODELS.openai;
const PEPPER = "drpepper";

const DETECTION_PATTERN_TEXT = /`+chronos\s+(.*?)`+/g;
const DETECTION_PATTERN_HTML = /^chronos\s+(.*?)$/;
const DETECTION_PATTERN_CODEBLOCK = /```chronos([\s\S]*?)```/g;

export {
	DEFAULT_LOCALE,
	PROVIDER_DEFAULT_MODELS,
	OPENAI_MODEL,
	PEPPER,
	DETECTION_PATTERN_TEXT,
	DETECTION_PATTERN_HTML,
	DETECTION_PATTERN_CODEBLOCK,
};
