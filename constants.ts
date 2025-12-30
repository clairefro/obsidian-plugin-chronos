const DEFAULT_LOCALE = "en";

const PROVIDER_DEFAULT_MODELS: Record<string, string> = {
	openai: "gpt-4o-mini",
	gemini: "gemini-2.5-flash",
};

const OPENAI_MODEL = PROVIDER_DEFAULT_MODELS.openai;
const PEPPER = "drpepper";

const DETECTION_PATTERN = /`chronos\s+(.*?)`/g;

export { DEFAULT_LOCALE, PROVIDER_DEFAULT_MODELS, OPENAI_MODEL, PEPPER, DETECTION_PATTERN};
