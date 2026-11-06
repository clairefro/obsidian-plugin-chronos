import test from "node:test";
import assert from "node:assert/strict";
import { decideAiEndpoint, resolveAiRequest } from "./.build/endpoint.mjs";

const OPENROUTER = "https://openrouter.ai/api/v1";
const decide = (url, approved = [], def = OPENROUTER) =>
	decideAiEndpoint(url, def, approved);

test("provider default host may receive the key", () => {
	assert.equal(decide(OPENROUTER).sendKey, true);
});

for (const url of [
	"http://localhost:1234/v1",
	"http://127.0.0.1:11434/v1",
	"http://127.0.0.5:8080/v1",
	"http://[::1]:8080/v1",
	"http://LOCALHOST./v1",
]) {
	test(`loopback may receive the key: ${url}`, () => {
		assert.equal(decide(url).sendKey, true);
	});
}

for (const url of [
	"http://localhost.evil.com/v1",
	"http://127.0.0.1.evil.com/v1",
	"https://evil.example/v1",
	"http://openrouter.ai/api/v1", // http variant of the default is not the default origin
	"https://openrouter.ai.evil.example/v1",
]) {
	test(`unapproved host does not receive the key: ${url}`, () => {
		assert.equal(decide(url).sendKey, false);
	});
}

test("LAN host without a key is allowed (self-hosted compatibility)", () => {
	const r = resolveAiRequest(
		"lmstudio",
		"http://192.168.1.5:8080/v1/",
		null,
		undefined,
		[],
	);
	assert.equal(r.baseUrl, "http://192.168.1.5:8080/v1");
	assert.equal(r.headers.Authorization, undefined);
});

test("approved custom origins receive the key; approval is per scheme and port", () => {
	const approved = ["https://llm.example.com", "http://192.168.1.5:8080"];
	assert.equal(decide("https://llm.example.com/v1", approved).sendKey, true);
	assert.equal(decide("http://192.168.1.5:8080/v1", approved).sendKey, true);
	assert.equal(decide("http://llm.example.com/v1", approved).sendKey, false);
	assert.equal(decide("http://192.168.1.5:9090/v1", approved).sendKey, false);
});

for (const bad of [
	"not a url",
	"",
	"ftp://example.com/v1",
	"https://user:pw@example.com/v1",
]) {
	test(`rejects invalid endpoint: ${JSON.stringify(bad)}`, () => {
		assert.throws(() => decide(bad));
	});
}

test("a configured key is refused, not silently dropped, for an unapproved host", () => {
	assert.throws(
		() =>
			resolveAiRequest(
				"openrouter",
				"https://evil.example/v1",
				"sk-secret",
				OPENROUTER,
				[],
			),
		(e) =>
			/not approved/.test(e.message) && !e.message.includes("sk-secret"),
	);
});

test("approved host gets a Bearer header", () => {
	const r = resolveAiRequest(
		"openrouter",
		"https://llm.example.com/v1",
		"sk-secret",
		OPENROUTER,
		["https://llm.example.com"],
	);
	assert.equal(r.headers.Authorization, "Bearer sk-secret");
});
