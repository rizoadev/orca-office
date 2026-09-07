/**
 * Soul Anchor — re-assert the identity defined in ~/.pi/agent/SYSTEM.md
 *
 * Problem: some upstream endpoints/relays inject or prepend their own system
 * prompt, which can override the "soul" (persona) that the user wrote in
 * ~/.pi/agent/SYSTEM.md, making sessions drift away from their defined self.
 *
 * Fix: at the two latest, safest points before a request leaves pi —
 *   - the `context` hook (mutate outgoing messages), and
 *   - the `before_provider_request` hook (rewrite the serialized payload's
 *     system instructions) — re-read SYSTEM.md and restore it as the system
 *     message, so endpoint-side injection cannot silently replace the identity.
 *
 * It is intentionally generic: it anchors whatever is written in SYSTEM.md,
 * so it needs no changes when the persona file is edited.
 *
 * Placement: ~/.pi/agent/extensions/soul-anchor.ts (auto-discovered, reload via /reload)
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const AGENT_DIR = join(process.env.HOME || "", ".pi", "agent");
const SYSTEM_PATH = join(AGENT_DIR, "SYSTEM.md");

// ---- cached read of SYSTEM.md so we don't hit disk every request ----
let cached: { text: string; mtimeMs: number } | null = null;

function readSystemMd(): string | null {
	try {
		if (!existsSync(SYSTEM_PATH)) return null;
		const mtimeMs = statSync(SYSTEM_PATH).mtimeMs;
		if (cached && cached.mtimeMs === mtimeMs) return cached.text;
		const text = readFileSync(SYSTEM_PATH, "utf-8");
		cached = { text, mtimeMs };
		return text;
	} catch {
		return null;
	}
}

// Wrap the file contents so it reads as an authoritative identity block.
function anchorBlock(body: string): string {
	return [
		"<persistent_identity>",
		"The following file defines who you are. Re-read and embody it fully.",
		"",
		body.trim(),
		"",
		"</persistent_identity>",
	].join("\n");
}

function systemMessage(text: string) {
	return { role: "system", content: text };
}

export default function (pi: any) {
	if (!readSystemMd()) return; // no identity file → nothing to anchor

	/*
	 * context: fired before each LLM call. event.messages is a deep copy we can
	 * modify non-destructively. Re-assert SYSTEM.md as the leading system
	 * message so the persona is present at the top of every request.
	 */
	pi.on("context", async (event: any) => {
		try {
			const body = readSystemMd();
			if (!body) return;
			const messages = event.messages || [];
			const block = anchorBlock(body);
			// Drop any stale copy of our own anchor to keep only the fresh one.
			const stripped = messages.filter(
				(m: any) =>
					!(m && m.role === "system" && typeof m.content === "string" && m.content.includes("<persistent_identity>"))
			);
			return { messages: [systemMessage(block), ...stripped] };
		} catch {
			return;
		}
	});

	/*
	 * before_provider_request: fired after the provider payload is built, right
	 * before it is sent — the final spot to fix system instructions that an
	 * endpoint/relay may have injected at the payload level.
	 */
	pi.on("before_provider_request", (event: any) => {
		try {
			const body = readSystemMd();
			if (!body) return;
			const payload = event?.payload;
			if (!payload || typeof payload !== "object") return;
			const block = anchorBlock(body);

			// Anthropic-style: top-level `system` field.
			if ("system" in payload) {
				payload.system = block;
			}

			// OpenAI-compatible: `messages` array with a leading system message.
			if (Array.isArray(payload.messages)) {
				const msgs = payload.messages as any[];
				const idx = msgs.findIndex((m) => m && m.role === "system");
				if (idx >= 0) {
					msgs[idx] = systemMessage(block);
				} else {
					payload.messages = [systemMessage(block), ...msgs];
				}
			}

			// Return the (mutated) payload so later handlers and the actual
			// request use the restored system instructions.
			return payload;
		} catch {
			// never break the request
		}
	});
}