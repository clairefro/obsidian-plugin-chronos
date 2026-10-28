import { requestUrl, RequestUrlResponse } from "obsidian";
import {
	PROVIDER_DEFAULT_BASE_URLS,
	PROVIDER_DEFAULT_MODELS,
} from "../../../constants";
import { systemPrompt } from "../systemPrompt";
import { AIProviderConfig, AIProviderInterface } from "./providerFactory";

interface OpenAICompatibleJson {
	choices?: {
		message?: { content?: unknown };
		text?: unknown;
		finish_reason?: string;
	}[];
	output?: { type?: string; content?: unknown }[];
	output_text?: unknown;
	incomplete_details?: { reason?: string };
	finish_reason?: string;
	status?: string;
}

function isTextPart(part: unknown): part is { type: string; text?: string } {
	const type = (part as { type?: string } | null)?.type;
	return type === "text" || type === "output_text";
}

function extractResponseText(value: unknown): string {
	if (typeof value === "string") return value.trim();
	if (!Array.isArray(value)) return "";
	return value
		.map((part: unknown) =>
			typeof part === "string"
				? part
				: isTextPart(part)
					? part.text || ""
					: "",
		)
		.join("")
		.trim();
}

export default class OpenAICompatibleProvider implements AIProviderInterface {
	private config: AIProviderConfig;

	constructor(config: AIProviderConfig) {
		this.config = config;
	}

	async toChronos(content: string): Promise<string> {
		const provider = this.config.provider;
		const apiKey = this.config.apiKey?.trim();
		if (provider === "openrouter" && !apiKey) {
			throw new Error("No OpenRouter API key provided");
		}

		const model =
			this.config.model || PROVIDER_DEFAULT_MODELS[provider] || "";
		if (!model) {
			throw new Error(
				`Set a model name for ${provider} in plugin settings`,
			);
		}

		const baseUrl = (
			this.config.baseUrl || PROVIDER_DEFAULT_BASE_URLS[provider]
		).replace(/\/+$/, "");
		if (!baseUrl) {
			throw new Error(
				`Set a base URL for ${provider} in plugin settings`,
			);
		}
		const useLMStudioChatApi =
			provider === "lmstudio" && /gpt-oss/i.test(model);
		const requestUrlValue = useLMStudioChatApi
			? `${baseUrl.replace(/\/v1\/?$/, "")}/api/v1/chat`
			: `${baseUrl}/chat/completions`;

		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};
		if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
		if (provider === "openrouter") {
			headers["HTTP-Referer"] =
				"https://github.com/clairefro/obsidian-plugin-chronos";
			headers["X-Title"] = "Chronos";
		}

		let response: RequestUrlResponse;
		try {
			response = await requestUrl({
				url: requestUrlValue,
				method: "POST",
				headers,
				body: JSON.stringify(
					useLMStudioChatApi
						? {
								model,
								input: content,
								system_prompt: systemPrompt,
								reasoning: "low",
								max_output_tokens: 4096,
							}
						: {
								model,
								max_tokens: 4096,
								messages: [
									{ role: "system", content: systemPrompt },
									{ role: "user", content },
								],
								temperature: 0.8,
							},
				),
			});
		} catch (e: unknown) {
			const error = e as { responseText?: string; message?: string };
			const message =
				error?.responseText || error?.message || String(e);
			throw new Error(`${provider} request failed: ${message}`);
		}

		const json = response?.json as OpenAICompatibleJson | undefined;
		const choice = json?.choices?.[0];
		const lmStudioMessageContent = Array.isArray(json?.output)
			? json.output
					.filter((item) => item?.type === "message")
					.map((item) => extractResponseText(item.content))
					.join("")
			: [];
		const result = useLMStudioChatApi
			? extractResponseText(lmStudioMessageContent)
			: extractResponseText(choice?.message?.content) ||
				extractResponseText(choice?.text) ||
				extractResponseText(json?.output_text);
		if (result) return result;

		const finishReason =
			choice?.finish_reason ||
			json?.incomplete_details?.reason ||
			json?.finish_reason ||
			json?.status ||
			"unknown";
		throw new Error(
			`${provider} returned no final response text (finish reason: ${finishReason}). ` +
				(useLMStudioChatApi
					? "LM Studio returned no message output from its native chat API. Check the model's chat template and available output-token budget."
					: "Check that the model's chat template supports chat completions and that its output-token budget is sufficient."),
		);
	}
}
