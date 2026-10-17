import { requestUrl } from "obsidian";
import { PROVIDER_DEFAULT_MODELS } from "../../../constants";
import { systemPrompt } from "../systemPrompt";
import { AIProviderInterface } from "./providerFactory";

const RETIRED_HAIKU_MODELS = [
	"claude-3-5-haiku-latest",
	"claude-3-5-haiku-20241022",
];

export default class AnthropicProvider implements AIProviderInterface {
	private apiKey: string;
	private model: string;

	constructor(apiKey: string, model?: string) {
		this.apiKey = apiKey;
		this.model =
			!model || RETIRED_HAIKU_MODELS.includes(model)
				? PROVIDER_DEFAULT_MODELS.anthropic
				: model;
	}

	async toChronos(content: string): Promise<string> {
		if (!this.apiKey) throw new Error("No Anthropic API key provided");

		let response: any;
		try {
			response = await requestUrl({
				url: "https://api.anthropic.com/v1/messages",
				method: "POST",
				throw: false,
				headers: {
					"Content-Type": "application/json",
					"x-api-key": this.apiKey,
					"anthropic-version": "2023-06-01",
				},
				body: JSON.stringify({
					model: this.model,
					max_tokens: 4096,
					system: systemPrompt,
					messages: [{ role: "user", content }],
				}),
			});
		} catch (error: any) {
			const message =
				error?.json?.error?.message ||
				error?.responseText ||
				error?.message ||
				String(error);
			throw new Error(`Anthropic request failed: ${message}`);
		}

		if (response.status >= 400) {
			const apiError = response.json?.error;
			const message =
				apiError?.message || response.text || "Unknown API error";
			const requestId = response.json?.request_id;
			throw new Error(
				`Anthropic request failed (${response.status}${apiError?.type ? ` ${apiError.type}` : ""}): ${message}${requestId ? ` (request ID: ${requestId})` : ""}`,
			);
		}

		const text = response?.json?.content
			?.filter((part: any) => part?.type === "text")
			.map((part: any) => part.text)
			.join("")
			.trim();
		if (text) return text;
		throw new Error("Anthropic returned no response text");
	}
}
