import assert from "node:assert/strict";
import { test } from "node:test";
import { cueForToolCall, dangerousBashCommand, sensitivePath } from "../mapping.ts";

test("dangerous bash commands cue warning", () => {
	for (const command of [
		"rm -rf build",
		"rm -fr /tmp/x",
		"sudo make install",
		"git reset --hard HEAD~1",
		"git clean -fd",
		"git push origin main --force",
		"shutdown -h now",
		"chmod -R 777 .",
		"dd if=/dev/zero of=/dev/sda",
	]) {
		assert.equal(dangerousBashCommand(command), true, `expected dangerous: ${command}`);
	}
});

test("benign bash commands do not cue warning", () => {
	for (const command of [
		"npm run build",
		"git status",
		"rm notes.txt",
		"mkdir -p src",
		"git push origin main",
		"echo hello",
		"ls -la",
	]) {
		assert.equal(dangerousBashCommand(command), false, `expected benign: ${command}`);
	}
});

test("sensitive paths cue warning on writes", () => {
	for (const path of [
		".env",
		".env.local",
		".git/config",
		"~/.ssh/id_rsa",
		"/home/u/.aws/credentials",
		"server.pem",
	]) {
		assert.equal(sensitivePath(path), true, `expected sensitive: ${path}`);
	}
});

test("ordinary paths do not cue warning", () => {
	for (const path of ["src/index.ts", "README.md", "package.json", "test/app.test.ts"]) {
		assert.equal(sensitivePath(path), false, `expected ordinary: ${path}`);
	}
});

test("cueForToolCall maps bash and write/edit to warning only when risky", () => {
	assert.equal(cueForToolCall("bash", { command: "rm -rf /" }), "warning");
	assert.equal(cueForToolCall("bash", { command: "git status" }), null);
	assert.equal(cueForToolCall("write", { path: ".env" }), "warning");
	assert.equal(cueForToolCall("edit", { path: "src/index.ts" }), null);
	assert.equal(cueForToolCall("read", { path: ".env" }), null, "reads are never warnings");
	assert.equal(cueForToolCall("write", {}), null, "missing path is benign");
});
