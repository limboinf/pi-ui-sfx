import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { buildSpawnArgs, effectiveVolume, resolveUisfxRoot } from "../audio.ts";

test("effectiveVolume scales with master volume and per-cue loudness", () => {
	const complete = effectiveVolume(0.7, "complete");
	const press = effectiveVolume(0.7, "press");
	assert.ok(complete > press, "complete (0.24) is louder than press (0.2)");
	assert.ok(press > 0 && press <= 1, "press volume is within (0, 1]");
});

test("effectiveVolume stays within (0, 1] and applies a floor near silence", () => {
	const max = effectiveVolume(1, "complete");
	assert.ok(max <= 1 && max > 0, `max within range: ${max}`);
	const floor = effectiveVolume(0.001, "press");
	assert.ok(floor >= 0.04, `near-silent master floors at >= 0.04: ${floor}`);
});

test("buildSpawnArgs produces valid afplay and ffplay commands", () => {
	const afplay = buildSpawnArgs({ kind: "afplay" }, "/tmp/x.mp3", 0.5);
	assert.equal(afplay.command, "afplay");
	assert.deepEqual(afplay.args, ["-v", "0.50", "/tmp/x.mp3"]);

	const ffplay = buildSpawnArgs({ kind: "ffplay" }, "/tmp/x.mp3", 0.5);
	assert.equal(ffplay.command, "ffplay");
	assert.ok(ffplay.args.includes("-volume"));
	assert.ok(ffplay.args.includes("50"));
	assert.ok(ffplay.args.includes("/tmp/x.mp3"));
});

test("resolveUisfxRoot locates the installed package and its scifi assets", () => {
	const root = resolveUisfxRoot();
	assert.ok(root, "uisfx package root should resolve");
	assert.ok(existsSync(`${root}/sounds/scifi/press.mp3`), "scifi/press.mp3 exists");
});
