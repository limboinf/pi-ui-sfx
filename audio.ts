/**
 * Terminal audio player for the uisfx packaged assets.
 *
 * Pi is a terminal app, so `createUISFX` (Web Audio) is not usable here. Per
 * the uisfx integration guide we instead play the packaged
 * `uisfx/sounds/<pack>/<cue>.mp3` files while preserving the same semantic and
 * lifecycle rules: one shared player, a persisted enabled/volume preference,
 * null-safe `play()`, and stop handles.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { CUE_VOLUME, NOMINAL_VOLUME } from "./cues.ts";

export interface SFXHandle {
	/** Stop this sound now (best effort; one-shots are short). */
	stop(): void;
	/** Resolves when playback finishes or the process is killed. */
	ended: Promise<void>;
}

export interface PlayerOptions {
	pack: string;
	volume: number;
	enabled: boolean;
}

export type Backend =
	| { kind: "afplay" }
	| { kind: "ffplay" }
	| { kind: "paplay" }
	| { kind: "powershell" }
	| { kind: "none" };

/** Master gain applied before mapping to the backend's own volume scale. */
const MASTER_GAIN = 0.85;
/** Never send a near-silent or clipping volume to a backend. */
const MIN_VOLUME = 0.04;
/** Suppress double-fires of the same cue within this window. */
const COOLDOWN_MS = 90;

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

/** Scale master volume + per-cue loudness into a 0..1 backend volume. */
export function effectiveVolume(master: number, cue: string): number {
	const cueVolume = CUE_VOLUME[cue] ?? NOMINAL_VOLUME;
	const relative = cueVolume / NOMINAL_VOLUME;
	return clamp(master * MASTER_GAIN * relative, MIN_VOLUME, 1);
}

function commandExists(command: string): boolean {
	const result = spawn(command, ["--version"], { stdio: "ignore" });
	// ENOENT means the binary does not exist; any other spawn outcome means the
	// command was found (afplay exits non-zero for --version but still spawns).
	const found = result.error?.code !== "ENOENT";
	result.unref();
	return found;
}

export function detectBackend(): Backend {
	if (process.platform === "darwin" && commandExists("afplay")) return { kind: "afplay" };
	if (commandExists("ffplay")) return { kind: "ffplay" };
	if (commandExists("paplay")) return { kind: "paplay" };
	if (process.platform === "win32") return { kind: "powershell" };
	return { kind: "none" };
}

/** Locate the installed uisfx package root via Node module resolution. */
export function resolveUisfxRoot(): string | null {
	const req = createRequire(import.meta.url);
	for (const spec of ["uisfx/manifest", "uisfx"]) {
		try {
			const resolved = req.resolve(spec);
			// "uisfx" resolves to dist/index.js; walk up past dist/.
			return spec === "uisfx" ? dirname(dirname(resolved)) : dirname(resolved);
		} catch {
			// Continue to the next resolution strategy.
		}
	}
	return null;
}

/** Build the command + args that play one mp3 at a 0..1 volume. */
export function buildSpawnArgs(backend: Backend, file: string, volume: number): { command: string; args: string[] } {
	switch (backend.kind) {
		case "afplay":
			return { command: "afplay", args: ["-v", volume.toFixed(2), file] };
		case "ffplay":
			return {
				command: "ffplay",
				args: ["-nodisp", "-autoexit", "-loglevel", "error", "-volume", String(Math.round(volume * 100)), file],
			};
		case "paplay":
			return { command: "paplay", args: [`--volume=${Math.round(volume * 65536)}`, file] };
		case "powershell":
			return {
				command: "powershell.exe",
				args: ["-NoProfile", "-Command", `(New-Object Media.SoundPlayer '${file.replace(/'/g, "''")}').PlaySync()`],
			};
		case "none":
			return { command: "", args: [] };
	}
}

/**
 * The single shared terminal player. One instance lives for the whole
 * extension; it owns backend detection and the current pack/volume/enabled
 * state so callers never spawn players ad hoc.
 */
export class TerminalPlayer {
	private backend: Backend;
	private options: PlayerOptions;
	private lastPlayed = new Map<string, number>();

	constructor(options: PlayerOptions) {
		this.backend = detectBackend();
		this.options = { ...options };
	}

	isEnabled(): boolean {
		return this.options.enabled && this.backend.kind !== "none";
	}

	setEnabled(enabled: boolean): void {
		this.options.enabled = enabled;
	}

	setVolume(volume: number): void {
		this.options.volume = clamp(volume, 0, 1);
	}

	setPack(pack: string): void {
		this.options.pack = pack;
	}

	getPack(): string {
		return this.options.pack;
	}

	private assetPath(cue: string): string | null {
		const root = resolveUisfxRoot();
		if (!root) return null;
		const file = join(root, "sounds", this.options.pack, `${cue}.mp3`);
		return existsSync(file) ? file : null;
	}

	/**
	 * Play a one-shot cue. Returns null when sound is disabled, no backend is
	 * available, or the cue asset is missing — callers must tolerate null.
	 */
	play(cue: string): SFXHandle | null {
		if (!this.isEnabled()) return null;

		const now = Date.now();
		const last = this.lastPlayed.get(cue) ?? 0;
		if (now - last < COOLDOWN_MS) return null;
		this.lastPlayed.set(cue, now);

		const file = this.assetPath(cue);
		if (!file) return null;

		const volume = effectiveVolume(this.options.volume, cue);
		const { command, args } = buildSpawnArgs(this.backend, file, volume);
		if (!command) return null;

		const child: ChildProcess = spawn(command, args, { stdio: "ignore", detached: process.platform !== "win32" });
		const ended = new Promise<void>((resolve) => {
			child.once("exit", () => resolve());
			child.once("error", () => resolve());
		});
		child.unref();

		return {
			stop() {
				if (child.exitCode === null && child.signalCode === null) {
					try {
						child.kill();
					} catch {
						// The process may have exited between the check and kill.
					}
				}
			},
			ended,
		};
	}
}
