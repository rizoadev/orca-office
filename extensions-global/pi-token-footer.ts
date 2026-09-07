/**
 * Pi Token Footer Extension
 *
 * Two-line custom footer:
 *   Line 1: {agent} ↑555.4k ↓16.4k ↕1:0.1 $0.0000 42.5%/128k  provider/model • thinking
 *   Line 2: #session cache:... tok/s  ~/path (repo) branch +n -n
 *
 * - Agent name from active-agent.json (curly braces, first column)
 * - Accumulated tokens/cost across ALL session entries
 * - Tokens/sec after streaming finishes
 * - Context usage % + context window
 * - Provider/model, thinking level, git info
 *
 * Placement: ~/.pi/agent/extensions/pi-token-footer.ts (auto-discovered, reload via /reload)
 */

import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { basename, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs";

const execFileP = promisify(execFile);

export default function (pi: ExtensionAPI) {
	// Streaming timing for tokens/s
	let streamingStartTime: number | null = null;
	let lastTokensPerSec: number | null = null;
	// Holds current tui.requestRender so message_end can refresh the footer.
	let footerRequestRender: (() => void) | null = null;
	// Cached git working-tree diff (added/deleted lines) + refresh timer.
	let gitDiff = { added: 0, deleted: 0 };
	let gitRepoName = "";
	let gitDiffTimer: ReturnType<typeof setInterval> | null = null;
	let gitDiffCwd: string | null = null;

	// Read active agent name from ~/.pi/agent/active-agent.json
	function getActiveAgent(): string {
		try {
			const agentDir = join(process.env.HOME || "", ".pi", "agent");
			const data = JSON.parse(fs.readFileSync(join(agentDir, "active-agent.json"), "utf-8"));
			return data.name || "🧕";
		} catch {
			return "🧕";
		}
	}

	const INDO_PERSONAS = [
		"Budi Santoso",
		"Dewi Lestari",
		"Rizky Pratama",
		"Siti Rahma",
		"Ahmad Fauzi",
		"Putri Wulandari",
		"Bayu Saputra",
		"Anisa Maharani",
		"Dimas Wicaksono",
		"Nadia Safira",
		"Fajar Nugraha",
		"Ratna Kusuma",
	];

	function getIndonesianName(sessionId: string): string {
		if (!sessionId) return "";
		let hash = 0;
		for (let i = 0; i < sessionId.length; i++) {
			hash = (hash << 5) - hash + sessionId.charCodeAt(i);
			hash |= 0;
		}
		return INDO_PERSONAS[Math.abs(hash) % INDO_PERSONAS.length];
	}

	// Derive the actual repo name from the origin remote URL
	function repoNameFromUrl(url: string): string {
		if (!url) return "";
		const trimmed = url.trim();
		let path = trimmed.split("://").pop() || "";
		if (path.includes("@")) path = path.slice(path.lastIndexOf("@") + 1);
		path = path.replace(/^[^/]*:\/\//, "");
		path = path.replace(/^[^:]*:/, "");
		const parts = path.split("/").filter(Boolean);
		let name = parts.pop() || "";
		if (name.endsWith(".git")) name = name.slice(0, -4);
		return name.trim();
	}

	async function refreshGitDiff(cwd: string) {
		if (!cwd || gitDiffCwd !== cwd) return;
		try {
			const { stdout } = await execFileP("git", ["diff", "--numstat", "HEAD"], {
				cwd,
				timeout: 3000,
			});
			let added = 0,
				deleted = 0;
			for (const line of stdout.split("\n")) {
				if (!line) continue;
				const [a, d] = line.split("\t");
				if (a !== "-" && d !== "-") {
					added += Number(a) || 0;
					deleted += Number(d) || 0;
				}
			}
			gitDiff = { added, deleted };
		} catch {
			// Not a git repo or git error; keep the previous value.
		}
		try {
			const { stdout } = await execFileP("git", ["remote", "get-url", "origin"], {
				cwd,
				timeout: 3000,
			});
			gitRepoName = repoNameFromUrl(stdout);
		} catch {
			gitRepoName = "";
		}
		if (footerRequestRender) footerRequestRender();
	}

	function startGitDiffRefresh(cwd: string) {
		gitDiffCwd = cwd;
		if (gitDiffTimer) {
			clearInterval(gitDiffTimer);
			gitDiffTimer = null;
		}
		gitDiff = { added: 0, deleted: 0 };
		void refreshGitDiff(cwd);
		gitDiffTimer = setInterval(() => void refreshGitDiff(cwd), 5000);
		// Why: unref so a live interval can't keep the event loop open in
		// non-interactive mode (pi -p would otherwise never exit).
		gitDiffTimer.unref?.();
	}

	const fmt = (n: number) => {
		if (!n) return "0";
		if (n < 1000) return `${n}`;
		if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
		return `${(n / 1_000_000).toFixed(2)}M`;
	};

	const fmtTps = (tps: number) => (tps < 100 ? tps.toFixed(1) : Math.round(tps).toString());

	// Accumulated usage across ALL session entries (matches built-in footer semantics).
	function computeTotals(ctx: any) {
		let input = 0,
			output = 0,
			cost = 0,
			cacheRead = 0,
			cacheWrite = 0;
		for (const e of ctx.sessionManager.getEntries()) {
			const u =
				e.type === "message"
					? (e.message.role === "assistant" || e.message.role === "toolResult")
						? (e.message as any).usage
						: undefined
					: (e.type === "branch_summary" || e.type === "compaction")
						? e.usage
						: undefined;
			if (!u) continue;
			input += u.input || 0;
			output += u.output || 0;
			cost += u.cost?.total || 0;
			cacheRead += u.cacheRead || u.cost?.cacheRead || 0;
			cacheWrite += u.cacheWrite || u.cost?.cacheWrite || 0;
		}
		return { input, output, cost, cacheRead, cacheWrite };
	}

	pi.on("session_start", async (_event, ctx) => {
		const theme = ctx.ui.theme;

		ctx.ui.setFooter((tui, footerTheme, footerData) => {
			footerRequestRender = () => tui.requestRender();
			const unsubBranch = footerData.onBranchChange(() => tui.requestRender());

			return {
				dispose: unsubBranch,
				invalidate() {
					tui.requestRender();
				},
				render(width: number): string[] {
					try {
						const t = computeTotals(ctx);

						// ---- Row 1, col 1: {agent} tokens + cost + context% ----
						let ctxUsage: any;
						try {
							ctxUsage = ctx.getContextUsage();
						} catch {
							ctxUsage = undefined;
						}
						const leftParts: string[] = [];
						// Canonical session name (set by pi-office or /name) for parity with office.
						// Fall back to local persona hash only if pi-office is not loaded.
						const agentName = getActiveAgent();
						const sessionId = ctx.sessionManager.getSessionId();
						const canonicalName = typeof pi.getSessionName === 'function' ? pi.getSessionName() : null;
						const indoName = sessionId ? getIndonesianName(sessionId) : "";
						const displayName = canonicalName
							? `${agentName} ${canonicalName}`
							: (indoName ? `${agentName} ${indoName}` : agentName);

						leftParts.push(footerTheme.fg("accent", displayName));
						leftParts.push(footerTheme.fg("dim", ` ↑${fmt(t.input)} ↓${fmt(t.output)}`));
						// Input:output ratio (1 : N) when input > 0
						if (t.input > 0) {
							const ratio = (t.output / t.input).toFixed(1);
							leftParts.push(footerTheme.fg("dim", ` ↕1:${ratio}`));
						}
						leftParts.push(footerTheme.fg("success", ` $${t.cost.toFixed(4)}`));
						if (ctxUsage && ctxUsage.contextWindow > 0 && ctxUsage.percent !== null && ctxUsage.percent !== undefined) {
							const pctStr =
								ctxUsage.percent < 10
									? ctxUsage.percent.toFixed(1)
									: Math.round(ctxUsage.percent).toString();
							leftParts.push(footerTheme.fg("dim", ` ${pctStr}%/${fmt(ctxUsage.contextWindow)}`));
						}
						const left = leftParts.join("");

						// ---- Row 1, col 2: provider/model + thinking ----
						const rightParts: string[] = [];
						const model = ctx.model;
						const providerModel = model ? `${model.provider}/${model.id}` : "no-model";
						const thinking = ctx.thinkingLevel || "off";
						rightParts.push(footerTheme.fg("dim", `${providerModel} • ${thinking}`));

						const right = rightParts.join(" ");

						// Row 1: right-align col 2 with >=2 space gap; pad full width.
						const padLen = Math.max(2, width - visibleWidth(left) - visibleWidth(right));
						const line1 = truncateToWidth(left + " ".repeat(padLen) + right, width);
						const pad1 = " ".repeat(Math.max(0, width - visibleWidth(line1)));

						// ---- Row 2, col 1: session id + cache + tok/s ----
						const l2Left: string[] = [];
						if (sessionId) {
							l2Left.push(footerTheme.fg("borderMuted", `#${sessionId.split("-")[0]}`));
						}
						if (t.cacheRead > 0 || t.cacheWrite > 0) {
							l2Left.push(footerTheme.fg("dim", `cache:${fmt(t.cacheRead)}→${fmt(t.cacheWrite)}`));
						}
						if (lastTokensPerSec !== null) {
							l2Left.push(footerTheme.fg("warning", `${fmtTps(lastTokensPerSec)}tok/s`));
						}

						// ---- Row 2, col 2: current path + project repo + branch ----
						const l2RightParts: string[] = [];
						const cwd = ctx.sessionManager.getCwd() || "";
						const home = process.env.HOME || process.env.USERPROFILE;
						let pathDisplay = cwd;
						if (home && pathDisplay.startsWith(home)) {
							pathDisplay = "~" + pathDisplay.slice(home.length);
						}
						l2RightParts.push(footerTheme.fg("dim", pathDisplay));
						const repo = gitRepoName || basename(cwd);
						if (repo) l2RightParts.push(footerTheme.fg("dim", `(${repo})`));
						const branch = footerData.getGitBranch();
						if (branch) l2RightParts.push(footerTheme.fg("accent", branch));
						if (gitDiff.added > 0) {
							l2RightParts.push(footerTheme.fg("success", `+${gitDiff.added}`));
						}
						if (gitDiff.deleted > 0) {
							l2RightParts.push(footerTheme.fg("error", `-${gitDiff.deleted}`));
						}
						const l2Right = l2RightParts.join(" ");

						const hasAny = l2Left.length > 0 || l2Right.length > 0;
						if (!hasAny) return [line1 + pad1];

						const l2LeftStr = " " + l2Left.join("  ");
						const pad2 = Math.max(2, width - visibleWidth(l2LeftStr) - visibleWidth(l2Right));
						const line2 = truncateToWidth(l2LeftStr + " ".repeat(pad2) + l2Right, width);
						const pad2t = " ".repeat(Math.max(0, width - visibleWidth(line2)));
						return [line1 + pad1, line2 + pad2t];
					} catch (err) {
						// Never let a render error blank the footer.
						return [footerTheme.fg("error", "footer error") + " ".repeat(width)];
					}
				},
			};
		});

		ctx.ui.setStatus(
			"pi-tokens",
			theme.fg("dim", `${ctx.model?.provider}/${ctx.model?.id || "idle"}`),
		);

		// Start periodic git working-tree diff refresh for this session's cwd.
		startGitDiffRefresh(ctx.sessionManager.getCwd() || "");
	});

	// Track streaming start (reset per assistant message)
	pi.on("message_start", async (event) => {
		if (event.message.role !== "assistant") return;
		streamingStartTime = Date.now();
		if (footerRequestRender) footerRequestRender();
	});

	// Compute tokens/s when streaming ends, then refresh footer
	pi.on("message_end", async (event, ctx) => {
		if (event.message.role !== "assistant") return;
		if (streamingStartTime === null) return;

		const elapsed = (Date.now() - streamingStartTime) / 1000;
		const m = event.message as AssistantMessage;
		const usage = m.usage as any;
		const outputTokens = usage?.output || 0;
		const totalTokens = (usage?.input || 0) + outputTokens;

		const measured = outputTokens > 0 ? outputTokens : totalTokens;

		if (elapsed > 0.1 && measured > 0) {
			lastTokensPerSec = measured / elapsed;
		}
		streamingStartTime = null;

		if (footerRequestRender) footerRequestRender();

		const theme = ctx.ui.theme;
		const modelName = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "idle";
		const thinking = ctx.thinkingLevel || "off";
		const tpsStr = lastTokensPerSec !== null ? ` ${fmtTps(lastTokensPerSec)}tok/s` : "";
		ctx.ui.setStatus("pi-tokens", theme.fg("dim", `${modelName} • ${thinking}${tpsStr}`));
	});

	pi.on("model_select", async (event, ctx) => {
		const theme = ctx.ui.theme;
		ctx.ui.setStatus("pi-tokens", theme.fg("dim", `${event.model.provider}/${event.model.id} • ${ctx.thinkingLevel || "off"}`));
		if (footerRequestRender) footerRequestRender();
	});

	pi.on("thinking_level_select", async (event, ctx) => {
		const theme = ctx.ui.theme;
		const modelName = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "idle";
		ctx.ui.setStatus("pi-tokens", theme.fg("dim", `${modelName} • ${event.level}`));
		if (footerRequestRender) footerRequestRender();
	});

	pi.on("turn_start", async (_event, ctx) => {
		const theme = ctx.ui.theme;
		const modelName = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "processing";
		ctx.ui.setStatus("pi-tokens", theme.fg("accent", `${modelName} • ${ctx.thinkingLevel || "off"}...`));
	});

	pi.on("turn_end", async (_event, ctx) => {
		const theme = ctx.ui.theme;
		const modelName = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "idle";
		const tpsStr = lastTokensPerSec !== null ? ` ${fmtTps(lastTokensPerSec)}tok/s` : "";
		ctx.ui.setStatus("pi-tokens", theme.fg("dim", `${modelName} • ${ctx.thinkingLevel || "off"}${tpsStr}`));
		// Refresh git +- right after a turn completes (files may have changed).
		void refreshGitDiff(ctx.sessionManager.getCwd() || "");
		if (footerRequestRender) footerRequestRender();
	});
}
