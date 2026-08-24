/**
 * Cue metadata for the semantic sounds this extension uses.
 *
 * `defaultVolume` values are the per-cue loudness from
 * https://uisfx.com/uisfx-catalog.json. They are relative to the master
 * volume, so quieter cues (typing-style) stay quiet and fuller cues
 * (complete) stay present without any caller tuning.
 */

/** Per-cue default volume from the uisfx catalog. */
export const CUE_VOLUME: Record<string, number> = {
	send: 0.2,
	receive: 0.2,
	complete: 0.24,
	warning: 0.22,
	error: 0.22,
	select: 0.2,
	open: 0.18,
	unlock: 0.2,
	lock: 0.2,
};

/** The cue volume treated as "nominal" when scaling to the terminal player. */
export const NOMINAL_VOLUME = 0.25;

/** All sound packs shipped by uisfx (stable, from the catalog). */
export const PACKS = [
	"minimal",
	"soft",
	"glass",
	"arcade",
	"mechanical",
	"organic",
	"dreamy",
	"scifi",
	"rubber",
	"cinematic",
	"studio",
	"zen",
] as const;

export type PackName = (typeof PACKS)[number];
