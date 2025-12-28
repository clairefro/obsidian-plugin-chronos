import { getProvider } from "./providers/providerFactory";

/**
 * High-level GenAi facade. Accepts either (apiKey) or (provider, apiKey).
 * Keeps the old shape (new GenAi(apiKey)) working, but allows selecting a
 * provider by name when desired.
 */
export class GenAi {
	private providerName: string;
	private apiKey: string;
	private model?: string;

	constructor(arg1: string, arg2?: string, arg3?: string) {
		if (arg2 === undefined) {
			// Only apiKey provided
			this.providerName = "openai";
			this.apiKey = arg1;
			this.model = undefined;
		} else {
			this.providerName = arg1 || "openai";
			this.apiKey = arg2;
			this.model = arg3;
		}
	}

	async toChronos(content: string): Promise<string> {
		if (!this.apiKey) throw new Error("No API Key set for AI provider");

		const provider = getProvider(
			this.providerName,
			this.apiKey,
			this.model,
		);
		return provider.toChronos(content);
	}
}
