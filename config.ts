/**
 * Persistent sound preference, stored per user (not per session).
 *
 * Falls back to a JSON file under ~/.pi/ because Pi extensions do not get a
 * dedicated "write to my own settings" API; the global settings.json is owned
 * by Pi and must not be mutated by an extension.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface SoundConfig {
	/** Master on/off switch. */
	enabled: boolean;
	/** Master volume, 0..1. */
	volume: number;
	/** Sound pack name (one of PACKS). */
	pack: string;
}

export const DEFAULT_CONFIG: SoundConfig = {
	enabled: true,
	volume: 0.7,
	pack: "scifi",
};

export const DEFAULT_CONFIG_FILE = join(homedir(), ".pi", "ui-sfx.json");

function clampVolume(value: number | undefined): number {
	if (typeof value !== "number" || Number.isNaN(value)) return DEFAULT_CONFIG.volume;
	return Math.min(1, Math.max(0, value));
}

/**
 * Load the persisted config, merging over defaults so a partial or corrupt
 * file never breaks startup.
 */
export function loadConfig(file: string = DEFAULT_CONFIG_FILE): SoundConfig {
	try {
		const raw = readFileSync(file, "utf8");
		const parsed = JSON.parse(raw) as Partial<SoundConfig>;
		return {
			enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULT_CONFIG.enabled,
			volume: clampVolume(parsed.volume),
			pack: typeof parsed.pack === "string" ? parsed.pack : DEFAULT_CONFIG.pack,
		};
	} catch {
		// Missing or unreadable file: fall back to defaults. A corrupt file is
		// not worth failing extension load over; the next save rewrites it.
		return { ...DEFAULT_CONFIG };
	}
}

/**
 * Persist the config. Creates the parent directory as needed.
 */
export function saveConfig(config: SoundConfig, file: string = DEFAULT_CONFIG_FILE): void {
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, JSON.stringify(config, null, 2) + "\n", "utf8");
}
