import OpenAIProvider from "./openai";
import GeminiProvider from "./gemini";

export type ProviderName = "openai" | "gemini";

export interface AIProviderInterface {
	toChronos(content: string): Promise<string>;
}

export function getProvider(
	provider: string,
	apiKey: string,
	model?: string,
): AIProviderInterface {
	const name = (provider || "openai").toLowerCase();
	switch (name) {
		case "openai":
			return new OpenAIProvider(apiKey, model);
		case "gemini":
			return new GeminiProvider(apiKey, model);
		default:
			throw new Error(`Unsupported AI provider: ${provider}`);
	}
}

export default getProvider;
