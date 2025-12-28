import { requestUrl } from "obsidian";
import { OPENAI_MODEL } from "../../../constants";
import { AIProviderInterface } from "./providerFactory";
import { systemPrompt } from "../systemPrompt";

const OLD_SCHEMA_MODELS = [
	// GPT-4o and derivatives
	"gpt-4o",
	"gpt-4o-mini",
	"gpt-4.1",
	"gpt-4.1-mini",
	"gpt-4.1-nano",

	// GPT-3.5 chat
	"gpt-3.5-turbo",
	"gpt-3.5-turbo-16k",
	"gpt-3.5-turbo-instruct",

	// “o-series” reasoning models
	"o1",
	"o1-mini",
	"o1-pro",
	"o3",
	"o3-mini",
	"o3-pro",

	// Any similar ones in the “o-series” family
	"o4-mini",
	"o4",
];

export class OpenAIProvider implements AIProviderInterface {
	private apiKey: string;
	private model: string;

	constructor(apiKey: string, model?: string) {
		this.apiKey = apiKey;
		this.model = model || OPENAI_MODEL;
	}

	async toChronos(content: string): Promise<string> {
		if (!this.apiKey) throw new Error("No OpenAI API key provided");

		const usesOldSchema = OLD_SCHEMA_MODELS.some((prefix) =>
			this.model.startsWith(prefix),
		);
		console.log({ usesOldSchema });
		let data: any;
		let url: string;

		if (!usesOldSchema) {
			// New GPT-5+ schema (requests to /v1/responses)
			data = {
				model: this.model,
				// opt-out of storing for privacy where supported
				store: false,
				input: [
					{
						role: "system",
						content: [
							{
								type: "input_text",
								text: systemPrompt,
							},
						],
					},
					{
						role: "user",
						content: [
							{
								type: "input_text",
								text: content,
							},
						],
					},
				],
				text: {
					format: {
						type: "text",
					},
				},
			};
			url = "https://api.openai.com/v1/responses";
		} else {
			// Use the old chat/completions schema for legacy models
			const messages = [
				{ role: "system", content: systemPrompt },
				{ role: "user", content },
			];

			data = {
				model: this.model,
				messages,
				temperature: 0.8,
			};
			url = "https://api.openai.com/v1/chat/completions";
		}

		const headers = {
			Authorization: `Bearer ${this.apiKey}`,
			"Content-Type": "application/json",
		};

		const options = {
			url,
			method: "POST",
			body: JSON.stringify(data),
			headers: headers as unknown as Record<string, string>,
		};

		// Perform request with error handling and robust parsing for both schemas
		let response: any;
		try {
			response = await requestUrl(options);
		} catch (err: any) {
			console.error("OpenAI request failed:", err);
			// attempt to surface a helpful message
			const msg =
				err?.responseText || err?.message || JSON.stringify(err);
			throw new Error(`OpenAI request failed: ${msg}`);
		}

		// Parse response depending on schema used
		if (!usesOldSchema) {
			// New `responses` endpoint: try common places for textual output
			const json = response?.json;
			if (!json) {
				throw new Error("OpenAI responses endpoint returned no JSON");
			}

			// Try several possible output shapes used by response-style APIs
			const output = json.output?.[0];
			const contentArray = output?.content || json.output || [];

			// prefer content items that carry text
			let textResult: string | undefined;
			if (Array.isArray(contentArray)) {
				for (const item of contentArray) {
					if (!item) continue;
					if (typeof item.text === "string") {
						textResult = item.text;
						break;
					}
					if (item.type === "output_text" && item.text) {
						textResult = item.text;
						break;
					}
					// nested content arrays
					if (Array.isArray(item.content)) {
						const nested = item.content.find(
							(c: any) => typeof c.text === "string",
						);
						if (nested) {
							textResult = nested.text;
							break;
						}
					}
				}
			}

			// fallback: some responses include `output_text` or `generated_text` top-level
			textResult =
				textResult ||
				json.output_text ||
				json.generated_text ||
				json.text ||
				undefined;

			if (textResult) return textResult;

			// last resort: return JSON string so user can inspect
			return JSON.stringify(json);
		}

		// Old schema: chat/completions
		return response.json.choices[0].message.content;
	}
}

export default OpenAIProvider;
