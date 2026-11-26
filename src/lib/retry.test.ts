// Run: node src/lib/retry.test.ts
import assert from "node:assert/strict";
import { geminiError, withFallback, withRetry } from "./retry.ts";

const apiErr = (code: number, message: string) => new Error(JSON.stringify({ error: { code, message } }));

// Raw Gemini JSON becomes one readable line with its status.
const e = geminiError(apiErr(503, "This model is busy. Try later."));
assert.equal(e.message, "Gemini: This model is busy.");
assert.equal(e.status, 503);
assert.equal(geminiError(new Error("plain")).status, 0);

// Retries a 503, then succeeds.
let calls = 0;
assert.equal(await withRetry(async () => (++calls < 3 ? Promise.reject(apiErr(503, "busy")) : "ok"), [0, 0]), "ok");
assert.equal(calls, 3);

// A 404 is not retried.
calls = 0;
await assert.rejects(withRetry(async () => (calls++, Promise.reject(apiErr(404, "No such model. Use another."))), [0, 0]), /No such model/);
assert.equal(calls, 1);

// Overloaded first model → falls through to the next one.
const tried: string[] = [];
const out = await withFallback(["a", "b", "c"], async (m) => (tried.push(m), m === "c" ? "from c" : Promise.reject(apiErr(503, "busy"))), [0]);
assert.equal(out, "from c");
assert.deepEqual(tried, ["a", "a", "b", "b", "c"]);

// A non-overload error stops at the first model (bad key shouldn't be masked).
tried.length = 0;
await assert.rejects(withFallback(["a", "b"], async (m) => (tried.push(m), Promise.reject(apiErr(400, "API key not valid. x"))), [0]), /API key not valid/);
assert.deepEqual(tried, ["a"]);

// All overloaded → the last error surfaces, readable.
await assert.rejects(withFallback(["a", "b"], async () => Promise.reject(apiErr(503, "Still busy. x")), [0]), /^Error: Gemini: Still busy\.$/);

// Our own timeout is treated as retryable, so a hung model falls through to the next.
const timeout = () => Object.assign(new Error("aborted"), { name: "TimeoutError" });
assert.equal(geminiError(timeout()).status, 504);
assert.equal(await withFallback(["slow", "fast"], async (m) => (m === "slow" ? Promise.reject(timeout()) : "fast ok"), [0]), "fast ok");

// A quota error isn't retried on the same option, but the next model/key gets a go.
tried.length = 0;
assert.equal(await withFallback(["k1:a", "k2:a"], async (m) => (tried.push(m), m === "k1:a" ? Promise.reject(apiErr(429, "You exceeded your current quota. x")) : "from k2"), [0]), "from k2");
assert.deepEqual(tried, ["k1:a", "k2:a"]);
assert.equal(geminiError(apiErr(429, "You exceeded your current quota. x")).quota, true);

console.log("retry ok");
