import OpenAIProvider from "./openai";
import GeminiProvider from "./gemini";
import AnthropicProvider from "./anthropic";
import OpenAICompatibleProvider from "./openAICompatible";

export type ProviderName =
	| "openai"
	| "gemini"
	| "anthropic"
	| "openrouter"
	| "ollama"
	| "lmstudio";

export interface AIProviderConfig {
	provider: ProviderName;
	apiKey?: string;
	model?: string;
	baseUrl?: string;
}

export interface AIProviderInterface {
	toChronos(content: string): Promise<string>;
}

export function getProvider(config: AIProviderConfig): AIProviderInterface;
export function getProvider(
	provider: string,
	apiKey?: string,
	model?: string,
	baseUrl?: string,
): AIProviderInterface;
export function getProvider(
	configOrProvider: AIProviderConfig | string,
	apiKey?: string,
	model?: string,
	baseUrl?: string,
): AIProviderInterface {
	const config: AIProviderConfig =
		typeof configOrProvider === "string"
			? {
					provider: configOrProvider as ProviderName,
					apiKey,
					model,
					baseUrl,
				}
			: configOrProvider;
	const name = (config.provider || "openai").toLowerCase();
	switch (name) {
		case "openai":
			return new OpenAIProvider(config.apiKey || "", config.model);
		case "gemini":
			return new GeminiProvider(config.apiKey || "", config.model);
		case "anthropic":
			return new AnthropicProvider(config.apiKey || "", config.model);
		case "openrouter":
		case "ollama":
		case "lmstudio":
			return new OpenAICompatibleProvider({
				...config,
				provider: name,
			});
		default:
			throw new Error(`Unsupported AI provider: ${config.provider}`);
	}
}

export default getProvider;
