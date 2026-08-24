/**
 * UI SFX — semantic sound effects for Pi.
 *
 * Plays the uisfx "scifi" pack through the terminal's native player, mapped to
 * real product events rather than raw clicks:
 *
 *   - press     user submits a prompt (input, interactive source)
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

import type {
	ExtensionAPI,
	ExtensionContext,
	ExtensionEvent,
	InputEvent,
	MessageStartEvent,
	SessionStartEvent,
	ToolCallEvent,
	ToolExecutionEndEvent,
} from "@earendil-works/pi-coding-agent";
import { TerminalPlayer } from "./audio.ts";
import { loadConfig, saveConfig, type SoundConfig } from "./config.ts";
import { PACKS } from "./cues.ts";
import { cueForToolCall } from "./mapping.ts";

type ApprovalOutcome = { outcome?: unknown };

// `ModelSelectEvent` is not re-exported from the package root, so derive it.
type ModelSelectEvent = Extract<ExtensionEvent, { type: "model_select" }>;

export default function (pi: ExtensionAPI) {
	const config: SoundConfig = loadConfig();
	const player = new TerminalPlayer({ pack: config.pack, volume: config.volume, enabled: config.enabled });

	// A run's first assistant message marks "the agent started replying".
	let runActive = false;
	let assistantStarted = false;

	function play(cue: string): void {
		player.play(cue);
	}

	// Pi broadcasts events in every mode (tui / rpc / json / print). Sound is
	// only meaningful in the interactive terminal, so each handler is gated on
	// `ctx.mode === "tui"` in one place.
	function onTui<E>(event: string, handler: (event: E, ctx: ExtensionContext) => void): void {
		(pi.on as (name: string, handler: (event: unknown, ctx: ExtensionContext) => void) => void)(
			event,
			(event, ctx) => {
				if (ctx.mode !== "tui") return;
				handler(event as E, ctx);
			},
		);
	}

	// --- User submits a prompt -------------------------------------------------
	onTui<InputEvent>("input", (event) => {
		if (event.source === "interactive") play("press");
	});

	// --- Agent starts / settles ------------------------------------------------
	onTui("agent_start", () => {
		runActive = true;
		assistantStarted = false;
	});

	onTui<MessageStartEvent>("message_start", (event) => {
		if (runActive && !assistantStarted && event.message.role === "assistant") {
			assistantStarted = true;
			play("receive");
		}
	});

	onTui("agent_settled", () => {
		runActive = false;
		assistantStarted = false;
		play("complete");
	});

	// --- Tool outcomes ----------------------------------------------------------
	onTui<ToolCallEvent>("tool_call", (event) => {
		const input = event.input as Record<string, unknown>;
		if (cueForToolCall(event.toolName, input) === "warning") play("warning");
	});

	onTui<ToolExecutionEndEvent>("tool_execution_end", (event) => {
		if (event.isError) play("error");
	});

	// --- Model changes (explicit user action only) ------------------------------
	onTui<ModelSelectEvent>("model_select", (event) => {
		if (event.source === "set" || event.source === "cycle") play("select");
	});

	// --- Session entry (explicit user transition only) ---------------------------
	onTui<SessionStartEvent>("session_start", (event) => {
		if (event.reason === "new" || event.reason === "resume" || event.reason === "fork") {
			play("open");
		}
	});

	// --- Approval outcome bridge for other extensions -----------------------------
	pi.events.on("uisfx:approval", (data) => {
		const outcome = (data as ApprovalOutcome)?.outcome;
		if (outcome === "approved") play("unlock");
		else if (outcome === "declined") play("lock");
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
