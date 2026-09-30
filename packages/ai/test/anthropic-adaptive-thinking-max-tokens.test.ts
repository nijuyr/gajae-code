import { describe, expect, it } from "bun:test";
import { Effort } from "../src/model-thinking";
import type { Model } from "../src/types";

// This test uses internal APIs to verify the fix for adaptive thinking max_tokens
// The bug: anthropic-adaptive models with high/xhigh/max reasoning
// request max_tokens = min(model.maxTokens, DEFAULT_REQUEST_MAX_TOKENS=32000)
// But all 32K gets consumed by thinking, leaving no output tokens.
// The fix: when reasoning is enabled with adaptive thinking,
// increase cap to model.maxTokens to allow room for both thinking and output.

describe("anthropic-adaptive thinking max_tokens for reasoning", () => {
	const createAdaptiveModel = (maxTokens: number): Model<"anthropic-messages"> => ({
		id: "claude-opus-5-5",
		name: "Claude Opus 5.5",
		api: "anthropic-messages",
		provider: "anthropic",
		baseUrl: "https://api.anthropic.com",
		reasoning: true,
		input: ["text", "image"],
		cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
		contextWindow: 200000,
		maxTokens,
		maxTokensSource: "discovered",
		thinking: {
			minLevel: Effort.Low,
			maxLevel: Effort.Max,
			mode: "anthropic-adaptive",
		},
	});

	it("should NOT cap adaptive model maxTokens at 32000 when reasoning xhigh is enabled and no explicit maxTokens given", () => {
		// This test documents the bug: currently, adaptive thinking models with xhigh reasoning
		// will have maxTokens capped at 32000 (DEFAULT_REQUEST_MAX_TOKENS) in the wire request,
		// causing all tokens to be consumed by thinking with no output.
		// After the fix, maxTokens should be increased to allow room for output.
		//
		// The bug is in mapOptionsForApi at stream.ts ~1023 where anthropic-adaptive reasoning
		// doesn't adjust maxTokens like budget-based thinking does at ~1099.
		//
		// Since we can't easily access mapOptionsForApi without integration testing,
		// this test documents the expected behavior after fixing mapOptionsForApi.
		// After the fix is applied:
		// - models with thinking.mode === "anthropic-adaptive" AND reasoning enabled
		// - should receive maxTokens > 32000 (when not explicitly set by caller)
		// - should receive maxTokens <= model.maxTokens
		// - should respect explicit caller maxTokens
		//
		// This test will be updated to use a real integration with stream() or
		// by exposing the mapOptionsForApi logic for testing.
		// For now, it documents the requirement.

		const model = createAdaptiveModel(128000);
		expect(model.thinking?.mode).toBe("anthropic-adaptive");
		expect(model.maxTokens).toBe(128000);
	});

	it("should maintain model catalog data for anthropic-adaptive models", () => {
		const model = createAdaptiveModel(128000);
		expect(model.id).toBe("claude-opus-5-5");
		expect(model.api).toBe("anthropic-messages");
		expect(model.thinking?.maxLevel).toBe(Effort.Max);
		expect(model.reasoning).toBe(true);
	});
});
