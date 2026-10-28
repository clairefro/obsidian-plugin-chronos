import { requestUrl, RequestUrlResponse } from "obsidian";
import { AIProviderInterface } from "./providerFactory";
import { systemPrompt } from "../systemPrompt";

interface GeminiPart {
	text?: string;
	display?: string;
}

interface GeminiOutput {
	content?: unknown;
	text?: string;
	outputText?: string;
}

interface GeminiResponse {
	candidates?: {
		content?: { parts?: GeminiPart[] } | GeminiPart[] | string;
		outputText?: string;
	}[];
	output?: GeminiOutput[];
	outputs?: GeminiOutput[];
	results?: GeminiOutput[];
	text?: string;
}

export class GeminiProvider implements AIProviderInterface {
	private apiKey: string;
	private model: string;

	constructor(apiKey: string, model?: string) {
		this.apiKey = apiKey;
		this.model = model || "gemini-2.5-flash";
	}

	async toChronos(content: string): Promise<string> {
		if (!this.apiKey) throw new Error("No Gemini API key provided");

		const model = this.model || "gemini-2.5-flash";
		const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

		const body = {
			system_instruction: {
				parts: [
					{
						text: systemPrompt,
					},
				],
			},
			contents: [
				{
					parts: [
						{
							text: content,
						},
					],
				},
			],
		};

		const options = {
			url,
			method: "POST",
			body: JSON.stringify(body),
			headers: {
				"Content-Type": "application/json",
				"x-goog-api-key": this.apiKey,
			} as Record<string, string>,
		};

		const resp: RequestUrlResponse = await requestUrl(options);
		const json = (resp?.json || {}) as GeminiResponse;

		const extractText = (obj: GeminiResponse): string => {
			if (!obj) return "";
			// candidates -> content/parts
			if (Array.isArray(obj.candidates) && obj.candidates.length) {
				const c = obj.candidates[0];
				// Gemini returns `content: { parts: [{ text }] }`
				if (c && typeof c.content === "object") {
					// sometimes content is an array of parts directly
					if (Array.isArray(c.content)) {
						return c.content
							.map((p) => p.text || p.display || "")
							.join("");
					}
					// content.parts -> [{ text }]
					const parts = c.content.parts;
					if (Array.isArray(parts) && parts.length) {
						return parts
							.map((p) => p.text || p.display || "")
							.join("");
					}
				}
				if (typeof c.outputText === "string") return c.outputText;
				if (typeof c.content === "string") return c.content;
			}

			// outputs / results shapes
			const out = obj.output || obj.outputs || obj.results;
			if (Array.isArray(out) && out.length) {
				const first = out[0];
				if (Array.isArray(first.content)) {
					return (first.content as GeminiPart[])
						.map((p) => p.text || "")
						.join("");
				}
				if (typeof first.text === "string") return first.text;
				if (typeof first.outputText === "string")
					return first.outputText;
			}

			if (typeof obj.text === "string") return obj.text;
			return "";
		};

		const result = extractText(json);
		if (result && result.length) return result;

		// if nothing matched, log the raw response for debugging and throw
		console.error("Gemini provider - unexpected response:", {
			status: resp?.status,
			json,
			text: resp?.text,
		});

		// last-resort recursive search for text fields in the response
		const findTextRecursively = (obj: unknown, depth = 0): string => {
			if (!obj || depth > 6) return "";
			if (typeof obj === "string") return obj;
			if (Array.isArray(obj)) {
				return obj
					.map((v) => findTextRecursively(v, depth + 1))
					.join(" ");
			}
			if (typeof obj === "object") {
				const rec = obj as Record<string, unknown>;
				// Prefer 'text' and 'content' keys
				if (typeof rec.text === "string" && rec.text.trim().length)
					return rec.text;
				if (
					typeof rec.outputText === "string" &&
					rec.outputText.trim().length
				)
					return rec.outputText;
				if (Array.isArray(rec.content))
					return findTextRecursively(rec.content, depth + 1);
				for (const k of Object.keys(rec)) {
					const val = rec[k];
					const found = findTextRecursively(val, depth + 1);
					if (found && found.trim().length) return found;
				}
			}
			return "";
		};

		const fallback = findTextRecursively(json) || resp?.text || "";
		if (fallback && fallback.length) return fallback;

		throw new Error("Unexpected Gemini response format");
	}
}

export default GeminiProvider;
