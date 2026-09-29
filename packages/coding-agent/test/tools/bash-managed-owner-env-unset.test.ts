import { afterEach, describe, expect, it } from "bun:test";
import { disposeAllShellSessions, setShellFactoryForTests } from "../../src/exec/bash-executor";
import type { ToolSession } from "../../src/tools";
import { BashTool, MANAGED_OWNER_BASH_ENV } from "../../src/tools/bash";
import { stubBashExecutorSettings } from "../helpers/tool-session-settings";

afterEach(async () => {
	setShellFactoryForTests(undefined);
	await disposeAllShellSessions();
});

function createSession(sessionId: string): ToolSession {
	return {
		cwd: process.cwd(),
		getSessionFile: () => null,
		getSessionId: () => sessionId,
		getMasterBashCapability: () => "master-capability-fixture",
		getMasterOwnerSessionId: () => undefined,
		settings: {
			has: () => false,
			get: () => undefined,
			getBashInterceptorRules: () => [],
			...stubBashExecutorSettings,
		},
	} as unknown as ToolSession;
}

function textOf(result: unknown): string {
	if (typeof result === "string") return result;
	const content = (result as { content?: { type: string; text?: string }[] }).content ?? [];
	return content.find(block => block.type === "text")?.text ?? "";
}

describe("issue #6139: unset managed-owner env family for nested admission", () => {
	it("unsets all managed-owner env vars to allow nested admission to return fresh", async () => {
		// Store original environment values
		const previousEnv = new Map(MANAGED_OWNER_BASH_ENV.map(name => [name, process.env[name]]));

		// Set all managed-owner env vars to simulate nested environment
		for (const name of MANAGED_OWNER_BASH_ENV) {
			process.env[name] = `test-${name.toLowerCase()}`;
		}

		try {
			// Build command that checks if each managed-owner env var is unset
			const checkCommands = Array.from(MANAGED_OWNER_BASH_ENV).map(
				name => `printf '%s=%s\\n' "${name}" "$(printenv ${name} || printf '<unset>')"`,
			);
			const command = checkCommands.join(" && ");

			const result = await new BashTool(createSession("managed-owner-test-session")).execute("call", {
				command,
			});

			const output = textOf(result);

			// Verify that each managed-owner env var is unset in the child
			for (const name of MANAGED_OWNER_BASH_ENV) {
				expect(output).toContain(`${name}=<unset>`);
			}
		} finally {
			// Restore original environment
			for (const [name, value] of previousEnv) {
				if (value === undefined) {
					delete process.env[name];
				} else {
					process.env[name] = value;
				}
			}
		}
	});
});
