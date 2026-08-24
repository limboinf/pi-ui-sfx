import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG, loadConfig, saveConfig } from "../config.ts";

function tempFile(): string {
	const dir = mkdtempSync(join(tmpdir(), "uisfx-config-"));
	return join(dir, "ui-sfx.json");
}

function tempDir(file: string): string {
	return file.slice(0, file.lastIndexOf("/"));
}

test("loadConfig returns defaults when the file is missing", () => {
	const file = tempFile();
	assert.deepEqual(loadConfig(file), DEFAULT_CONFIG);
});

test("saveConfig and loadConfig round-trip", () => {
	const file = tempFile();
	const config = { enabled: false, volume: 0.35, pack: "zen" };
	saveConfig(config, file);
	assert.deepEqual(loadConfig(file), config);
	rmSync(tempDir(file), { recursive: true, force: true });
});

test("loadConfig clamps out-of-range volume and tolerates partial files", () => {
	const file = tempFile();
	writeFileSync(file, JSON.stringify({ enabled: true, volume: 7 }), "utf8");
	const loaded = loadConfig(file);
	assert.equal(loaded.enabled, true);
	assert.equal(loaded.volume, 1, "volume above 1 clamps to 1");
	assert.equal(loaded.pack, DEFAULT_CONFIG.pack, "missing pack falls back to default");
	rmSync(tempDir(file), { recursive: true, force: true });
});

test("loadConfig tolerates a corrupt file and returns defaults", () => {
	const file = tempFile();
	writeFileSync(file, "not json {", "utf8");
	assert.deepEqual(loadConfig(file), DEFAULT_CONFIG);
	rmSync(tempDir(file), { recursive: true, force: true });
});
