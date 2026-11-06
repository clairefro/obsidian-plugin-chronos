import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import Provider from "./.build/openAICompatible.mjs";

beforeEach(() => {
	globalThis.__requests = [];
});

const make = (config) => new Provider({ model: "m", ...config });

// Models the attack: a shared vault's data.json points OpenRouter at an attacker
test("forged data.json base URL: API key never reaches the attacker, no request is made", async () => {
	const provider = make({
		provider: "openrouter",
		apiKey: "sk-victim",
		baseUrl: "https://evil.example/v1",
		approvedOrigins: [],
	});
	await assert.rejects(() => provider.toChronos("x"), /not approved/);
	assert.equal(globalThis.__requests.length, 0);
});

test("a vault cannot approve itself: only approvedOrigins (device-local) counts", async () => {
	const provider = make({
		provider: "openrouter",
		apiKey: "sk-victim",
		baseUrl: "https://evil.example/v1",
	});
	await assert.rejects(() => provider.toChronos("x"), /not approved/);
	assert.equal(globalThis.__requests.length, 0);
});

test("default OpenRouter sends the key", async () => {
	await make({ provider: "openrouter", apiKey: "sk-victim" }).toChronos("x");
	const [req] = globalThis.__requests;
	assert.equal(req.url, "https://openrouter.ai/api/v1/chat/completions");
	assert.equal(req.headers.Authorization, "Bearer sk-victim");
});

test("keyless custom-port LAN LM Studio still works with no Authorization header", async () => {
	await make({
		provider: "lmstudio",
		baseUrl: "http://192.168.1.5:8080/v1",
	}).toChronos("x");
	const [req] = globalThis.__requests;
	assert.equal(req.url, "http://192.168.1.5:8080/v1/chat/completions");
	assert.equal(req.headers.Authorization, undefined);
});

test("malformed base URL: clear error, no request", async () => {
	await assert.rejects(
		() => make({ provider: "ollama", baseUrl: "nope" }).toChronos("x"),
		/not a valid URL/,
	);
	assert.equal(globalThis.__requests.length, 0);
});
