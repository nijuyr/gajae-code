import { afterEach, describe, expect, it } from "bun:test";
import { disposeAllShellSessions, setShellFactoryForTests } from "../../src/exec/bash-executor";
import { admitManagedOwnerBeforeCli } from "../../src/gjc-runtime/managed-owner-admission";
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
			// Capture child env by printing GJC_ and PI_ env vars
			const childEnvCommand = "env | grep -E '^(GJC_|PI_)' | sort";
			const childEnvResult = await new BashTool(createSession("managed-owner-test-session")).execute("call", {
				command: childEnvCommand,
			});

			const childEnvText = textOf(childEnvResult);
			const childEnvLines = childEnvText.split("\n").filter((line: string) => line.length > 0);
			const childEnv: Record<string, string> = {};
			for (const line of childEnvLines) {
				const equalsIdx = line.indexOf("=");
				if (equalsIdx > 0) {
					const key = line.slice(0, equalsIdx);
					const value = line.slice(equalsIdx + 1);
					childEnv[key] = value;
				}
			}

			// Verify that each managed-owner env var is unset in the child
			for (const name of MANAGED_OWNER_BASH_ENV) {
				expect(childEnv[name]).toBeUndefined();
			}

			// Swap process.env temporarily to evaluate admission under child env
			const savedEnv = process.env;
			try {
				process.env = { ...childEnv };
				const admission = await admitManagedOwnerBeforeCli();
				// Expect fresh admission (no managed-owner env set)
				expect(admission.kind).toBe("fresh");
			} finally {
				process.env = savedEnv;
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

	it("throws managed_owner_admission_metadata_invalid when partial managed-owner env is set", async () => {
		// Store original environment values
		const previousEnv = new Map(MANAGED_OWNER_BASH_ENV.map(name => [name, process.env[name]]));
		const previousStateDir = process.env.GJC_TMUX_OWNER_STATE_DIR;
		const previousGeneration = process.env.GJC_TMUX_OWNER_GENERATION;
		const previousRunId = process.env.GJC_MANAGED_OWNER_RUN_ID;
		const previousIncarnation = process.env.GJC_MANAGED_OWNER_INCARNATION;

		try {
			// Set a full managed-owner environment
			process.env.GJC_TMUX_OWNER_STATE_DIR = "/tmp/test-state";
			process.env.GJC_COORDINATOR_SESSION_ID = "test-session-id";
			process.env.GJC_TMUX_OWNER_GENERATION = "gen-1";
			process.env.GJC_MANAGED_OWNER_RUN_ID = "run-1";
			process.env.GJC_MANAGED_OWNER_INCARNATION = "incarnation-1";

			// Now remove only GJC_COORDINATOR_SESSION_ID to simulate partial/broken env
			delete process.env.GJC_COORDINATOR_SESSION_ID;

			// This should throw because the metadata is invalid (missing required field)
			let errorThrown: Error | undefined;
			try {
				await admitManagedOwnerBeforeCli();
			} catch (error) {
				errorThrown = error instanceof Error ? error : new Error(String(error));
			}
			expect(errorThrown).toBeDefined();
			expect(errorThrown?.message).toBe("managed_owner_admission_metadata_invalid");
		} finally {
			// Restore original environment
			if (previousStateDir === undefined) {
				delete process.env.GJC_TMUX_OWNER_STATE_DIR;
			} else {
				process.env.GJC_TMUX_OWNER_STATE_DIR = previousStateDir;
			}
			if (previousGeneration === undefined) {
				delete process.env.GJC_TMUX_OWNER_GENERATION;
			} else {
				process.env.GJC_TMUX_OWNER_GENERATION = previousGeneration;
			}
			if (previousRunId === undefined) {
				delete process.env.GJC_MANAGED_OWNER_RUN_ID;
			} else {
				process.env.GJC_MANAGED_OWNER_RUN_ID = previousRunId;
			}
			if (previousIncarnation === undefined) {
				delete process.env.GJC_MANAGED_OWNER_INCARNATION;
			} else {
				process.env.GJC_MANAGED_OWNER_INCARNATION = previousIncarnation;
			}
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
