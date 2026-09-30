import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as path from "node:path";
import { Agent } from "@gajae-code/agent-core";
import { getBundledModel } from "@gajae-code/ai";
import { createMockModel } from "@gajae-code/ai/providers/mock";
import { ModelRegistry } from "@gajae-code/coding-agent/config/model-registry";
import { Settings } from "@gajae-code/coding-agent/config/settings";
import { AgentSession } from "@gajae-code/coding-agent/session/agent-session";
import { AuthStorage } from "@gajae-code/coding-agent/session/auth-storage";
import { convertToLlm } from "@gajae-code/coding-agent/session/messages";
import { SessionManager } from "@gajae-code/coding-agent/session/session-manager";
import { TempDir } from "@gajae-code/utils";

describe("AgentSession volatile context cache consistency", () => {
	let tempDir: TempDir;
	let authStorage: AuthStorage;
	let session: AgentSession;
	let sessionManager: SessionManager;

	beforeEach(async () => {
		tempDir = TempDir.createSync("@gjc-volatile-context-cache-");
		authStorage = await AuthStorage.create(path.join(tempDir.path(), "testauth.db"));
		authStorage.setRuntimeApiKey("anthropic", "anthropic-test-key");
		const model = getBundledModel("anthropic", "claude-sonnet-4-5");
		if (!model) throw new Error("Expected bundled Anthropic test model to exist");
		const mock = createMockModel({ responses: Array.from({ length: 10 }, () => ({ content: ["ack"] })) });
		const agent = new Agent({
			getApiKey: provider => `${provider}-test-key`,
			initialState: { model, systemPrompt: ["Test"], tools: [], messages: [] },
			streamFn: mock.stream,
			convertToLlm,
		});
		sessionManager = SessionManager.inMemory(tempDir.path());
		session = new AgentSession({
			agent,
			sessionManager,
			settings: Settings.isolated({ "compaction.enabled": false }),
			modelRegistry: new ModelRegistry(authStorage),
		});
	});

	afterEach(async () => {
		await session.dispose();
		authStorage.close();
		tempDir.removeSync();
	});

	it("keeps volatile project context at stable position across turns for prompt cache consistency", async () => {
		// Turn 1
		await session.prompt("first prompt");
		const firstAgentMessages = session.agent.state.messages;

		// Turn 2
		await session.prompt("second prompt");
		const secondAgentMessages = session.agent.state.messages;

		// The second request's message list should keep volatile context at a stable position.
		// This is essential for prompt cache consistency.
		//
		// Without the fix:
		// - Turn 1: [volatile-project-context (index 0), user, assistant]
		// - Turn 2: [user, assistant, volatile-project-context, user, assistant]
		// This breaks the cache because the volatile context moved.
		//
		// With the fix:
		// - Turn 1: [volatile-project-context (index 0), user, assistant]
		// - Turn 2: [volatile-project-context (index 0), user, assistant, user, assistant]
		// The volatile context stays at index 0, so the cache is preserved.

		// Verify that volatile context is present at index 0 in both turns
		expect(firstAgentMessages.length).toBeGreaterThan(0);
		expect(secondAgentMessages.length).toBeGreaterThan(0);

		// The first message should be volatile context in both turns
		const firstVolatile = firstAgentMessages[0];
		const secondVolatile = secondAgentMessages[0];
		expect(firstVolatile.role).toBe("custom");
		expect(secondVolatile.role).toBe("custom");
		if (firstVolatile.role === "custom" && secondVolatile.role === "custom") {
			expect(firstVolatile.customType).toBe("volatile-project-context");
			expect(secondVolatile.customType).toBe("volatile-project-context");
			// Volatile context is at the same index (0) in both turns
		}

		// The key requirement is that volatile context remains at index 0.
		// This ensures the prompt cache prefix can be reused across turns.
		// The exact number of messages after the volatile context may vary
		// depending on implementation details, but the volatile context position
		// must be stable.
	});
});
