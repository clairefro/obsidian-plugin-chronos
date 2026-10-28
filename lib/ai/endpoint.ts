/**
 * Decides whether an API key may be attached to a request for a configurable
 * AI endpoint (openrouter / ollama / lmstudio).
 *
 * The base URL lives in the plugin's data.json, which is vault content and can
 * arrive via a synced or shared vault. The API key lives in SecretStorage. So
 * the question answered here is "may this key go to this host?", not "is this
 * URL well formed?". Requests without a key are never blocked on host grounds,
 * so self-hosted OpenAI-compatible servers on any host or port keep working.
 *
 * Kept free of `obsidian` imports so it can be unit tested in plain Node.
 */

export interface AiEndpointDecision {
	/** Base URL with trailing slashes removed. */
	baseUrl: string;
	/** Origin (scheme + host + port) that approval is recorded against. */
	origin: string;
	/** True when an Authorization header may be attached for this endpoint. */
	sendKey: boolean;
}

const LOOPBACK_IPV4 = /^127(?:\.\d{1,3}){3}$/;

function hostnameOf(url: URL): string {
	// URL keeps IPv6 hosts bracketed and may keep a trailing dot
	return url.hostname.toLowerCase().replace(/\.$/, "");
}

export function isLoopbackUrl(url: URL): boolean {
	const host = hostnameOf(url);
	return host === "localhost" || host === "[::1]" || LOOPBACK_IPV4.test(host);
}

/**
 * Parses and validates a configured base URL. Throws on anything that must not
 * receive a request at all (malformed, non-http(s), embedded credentials).
 */
export function parseAiBaseUrl(raw: string): URL {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		throw new Error("The AI base URL is not a valid URL");
	}
	if (url.protocol !== "https:" && url.protocol !== "http:") {
		throw new Error("The AI base URL must start with http:// or https://");
	}
	if (url.username || url.password) {
		throw new Error(
			"The AI base URL must not contain embedded credentials",
		);
	}
	return url;
}

/**
 * @param defaultBaseUrl the provider's built-in URL; its origin is trusted
 * @param approvedOrigins origins the user approved on this device (never read
 *   from data.json, which a shared vault could forge)
 */
export function decideAiEndpoint(
	rawBaseUrl: string,
	defaultBaseUrl: string | undefined,
	approvedOrigins: string[],
): AiEndpointDecision {
	const url = parseAiBaseUrl(rawBaseUrl);
	const origin = url.origin;

	const isDefaultHost =
		!!defaultBaseUrl && new URL(defaultBaseUrl).origin === origin;
	// The built-in OpenRouter URL is https; a http variant of it is not the default
	const sendKey =
		isDefaultHost || isLoopbackUrl(url) || approvedOrigins.includes(origin);

	return {
		baseUrl: rawBaseUrl.replace(/\/+$/, ""),
		origin,
		sendKey,
	};
}

/**
 * Resolves the endpoint for a request and the auth headers that may go with it.
 * Throws before any request is made if the endpoint is invalid, or if an API
 * key is configured but the host has not been approved to receive it.
 */
export function resolveAiRequest(
	provider: string,
	rawBaseUrl: string,
	apiKey: string | null | undefined,
	defaultBaseUrl: string | undefined,
	approvedOrigins: string[],
): { baseUrl: string; headers: Record<string, string> } {
	const decision = decideAiEndpoint(
		rawBaseUrl,
		defaultBaseUrl,
		approvedOrigins,
	);
	const headers: Record<string, string> = {};
	if (apiKey) {
		if (!decision.sendKey) {
			throw new Error(
				`Your ${provider} API key was not sent: ${decision.origin} is not approved to receive it. ` +
					`If you trust this server, approve it in Chronos settings next to the base URL.`,
			);
		}
		headers.Authorization = `Bearer ${apiKey}`;
	}
	return { baseUrl: decision.baseUrl, headers };
}
