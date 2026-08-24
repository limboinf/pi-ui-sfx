/**
 * UI SFX — semantic sound effects for Pi.
 *
 * Plays the uisfx "scifi" pack through the terminal's native player, mapped to
 * real product events rather than raw clicks:
 *
 *   - send      user submits a prompt (input, interactive source)
 *   - receive   the agent starts producing its reply (first assistant message)
 *   - complete  the agent fully settles (no retry/compaction/follow-up left)
 *   - warning   a consequential tool call needs review (dangerous bash, sensitive write)
 *   - error     a tool execution failed
 *   - select    the model changed by an explicit user action
 *   - open      the user entered a session (new / resume / fork)
 *
 * Loops are intentionally unused: per product decision there is no sound for
 * continuous agent work or streaming replies, only discrete state transitions.
 *
 * Commands:
 *   /sound [on|off|status]   toggle or inspect the master switch
 *   /sound-volume <0-100>    set master volume
 *   /sound-pack [name]       list packs or set one
 *
 * Approval bridge: Pi exposes no global approval/confirm event, so this
 * extension cues `warning` at the "needs review" moment. Other extensions that
 * run their own approval dialogs can emit `pi.events.emit("uisfx:approval",
 * { outcome: "approved" | "declined" })` to get the unlock/lock outcome cue.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { TerminalPlayer } from "./audio.ts";
import { loadConfig, saveConfig, type SoundConfig } from "./config.ts";
import { PACKS } from "./cues.ts";
import { cueForToolCall } from "./mapping.ts";

type ApprovalOutcome = { outcome?: unknown };

export default function (pi: ExtensionAPI) {
	const config: SoundConfig = loadConfig();
	const player = new TerminalPlayer({ pack: config.pack, volume: config.volume, enabled: config.enabled });

	// A run's first assistant message marks "the agent started replying".
	let runActive = false;
	let assistantStarted = false;

	function play(cue: string): void {
		player.play(cue);
	}

	// --- User submits a prompt -------------------------------------------------
	pi.on("input", (event, ctx) => {
		if (ctx.mode !== "tui") return;
		if (event.source === "interactive") play("send");
	});

	// --- Agent starts / settles ------------------------------------------------
	pi.on("agent_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		runActive = true;
		assistantStarted = false;
	});

	pi.on("message_start", (event, ctx) => {
		if (ctx.mode !== "tui") return;
		if (runActive && !assistantStarted && event.message.role === "assistant") {
			assistantStarted = true;
			play("receive");
		}
	});

	pi.on("agent_settled", (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		runActive = false;
		assistantStarted = false;
		play("complete");
	});

	// --- Tool outcomes ----------------------------------------------------------
	pi.on("tool_call", (event, ctx) => {
		if (ctx.mode !== "tui") return;
		const input = event.input as Record<string, unknown>;
		if (cueForToolCall(event.toolName, input) === "warning") play("warning");
	});

	pi.on("tool_execution_end", (event, ctx) => {
		if (ctx.mode !== "tui") return;
		if (event.isError) play("error");
	});

	// --- Model changes (explicit user action only) ------------------------------
	pi.on("model_select", (event, ctx) => {
		if (ctx.mode !== "tui") return;
		if (event.source === "set" || event.source === "cycle") play("select");
	});

	// --- Session entry (explicit user transition only) ---------------------------
	pi.on("session_start", (event, ctx) => {
		if (ctx.mode !== "tui") return;
		if (event.reason === "new" || event.reason === "resume" || event.reason === "fork") {
			play("open");
		}
	});

	// --- Approval outcome bridge for other extensions -----------------------------
	pi.events.on("uisfx:approval", (data: ApprovalOutcome) => {
		if (data?.outcome === "approved") play("unlock");
		else if (data?.outcome === "declined") play("lock");
	});

	// --- Commands -----------------------------------------------------------------
	pi.registerCommand("sound", {
		description: "Toggle or inspect UI sound effects (on|off|status)",
		handler: async (args, ctx) => {
			const arg = args.trim().toLowerCase();
			if (arg === "on" || arg === "off") {
				config.enabled = arg === "on";
				player.setEnabled(config.enabled);
				saveConfig(config);
			} else if (arg !== "" && arg !== "status") {
				ctx.ui.notify('Usage: /sound [on|off|status]', "error");
				return;
			}
			ctx.ui.notify(
				`Sound ${config.enabled ? "on" : "off"} — pack ${config.pack}, volume ${Math.round(config.volume * 100)}%`,
				"info",
			);
		},
	});

	pi.registerCommand("sound-volume", {
		description: "Set UI sound volume (0-100)",
		handler: async (args, ctx) => {
			const value = Number.parseInt(args.trim(), 10);
			if (Number.isNaN(value) || value < 0 || value > 100) {
				ctx.ui.notify("Usage: /sound-volume <0-100>", "error");
				return;
			}
			config.volume = value / 100;
			player.setVolume(config.volume);
			saveConfig(config);
			ctx.ui.notify(`Sound volume ${value}%`, "info");
		},
	});

	pi.registerCommand("sound-pack", {
		description: "List sound packs, or set one (e.g. /sound-pack scifi)",
		handler: async (args, ctx) => {
			const pack = args.trim().toLowerCase();
			if (!pack) {
				ctx.ui.notify(`Packs: ${PACKS.join(", ")}`, "info");
				return;
			}
			if (!PACKS.includes(pack as (typeof PACKS)[number])) {
				ctx.ui.notify(`Unknown pack "${pack}". Packs: ${PACKS.join(", ")}`, "error");
				return;
			}
			config.pack = pack;
			player.setPack(pack);
			saveConfig(config);
			ctx.ui.notify(`Sound pack: ${pack}`, "info");
		},
	});

}
