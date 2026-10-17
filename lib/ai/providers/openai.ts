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
	"o3",
	"o3-mini",

	// Any similar ones in the “o-series” family
	"o4-mini",
	"o4",
];

function extractResponsesText(json: any): string {
	const outputs = Array.isArray(json?.output) ? json.output : [];
	const messages = outputs.filter(
		(item: any) => item?.type === "message" && item?.role === "assistant",
	);
	const finalMessages = messages.filter(
		(item: any) => item.phase === "final_answer",
	);
	const unphasedMessages = messages.filter((item: any) => !item.phase);
	const answerMessages = finalMessages.length
		? finalMessages
		: unphasedMessages;
	const text = answerMessages
		.flatMap((message: any) =>
			Array.isArray(message.content) ? message.content : [],
		)
		.filter((item: any) => item?.type === "output_text")
		.map((item: any) => item.text || "")
		.join("")
		.trim();

	return text || json?.output_text?.trim() || "";
}

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

			const textResult = extractResponsesText(json);
			if (textResult) return textResult;

			const reason =
				json.incomplete_details?.reason ||
				json.error?.message ||
				json.status ||
				"unknown";
			throw new Error(
				`OpenAI Responses API returned no final text (reason: ${reason})`,
			);
		}

		// Old schema: chat/completions
		return response.json.choices[0].message.content;
	}
}

export default OpenAIProvider;
