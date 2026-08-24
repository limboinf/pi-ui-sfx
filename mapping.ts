/**
 * Pure event-to-cue decisions.
 *
 * Kept side-effect free so the mapping can be unit tested without audio,
 * player backends, or a live Pi session.
 */

const DANGEROUS_BASH_PATTERNS: RegExp[] = [
	/\brm\s+-(?:[a-z]*r[a-z]*f|f[a-z]*r)[a-z]*\b/i, // rm -rf / rm -fr variants
	/\brm\s+-(?:[a-z]*r[a-z]*)\s+(\/|~|\$HOME|\*)/i, // recursive rm of root/home/glob
	/\bsudo\b/i,
	/\bgit\s+reset\s+--hard\b/i,
	/\bgit\s+clean\s+-(?:f|fd|x)[a-z]*\b/i,
	/\bgit\s+push\b[^\n]*--force\b/i,
	/\bgit\s+push\b[^\n]*-f\b/i,
	/\bmkfs\b/i,
	/\bdd\s+if=/i,
	/\b(shutdown|reboot|halt|poweroff)\b/i,
	/\bchmod\s+-(?:R\s+)?777\b/i,
	/\bchmod\s+000\b/i,
	/\b:>\s*\/dev\//i,
	/\b>\/dev\/(sd|nvme|disk)/i,
];

const SENSITIVE_PATH_PATTERNS: RegExp[] = [
	/\.env(\..*)?$/i,
	/\.git[\\/]config$/i,
	/\.git-credentials$/i,
	/\.npmrc$/i,
	/\.aws[\\/]/i,
	/\.ssh[\\/]/i,
	/(^|[\\/])id_(rsa|ed25519|ecdsa|dsa)$/i,
	/\.pem$/i,
	/(^|[\\/])credentials([\\/.]|$)/i,
	/(^|[\\/])secrets?([\\/.]|$)/i,
];

/**
 * Whether a bash command is risky enough to warrant an attention cue
 * (the "needs review / approval" moment).
 */
export function dangerousBashCommand(command: string): boolean {
	if (!command) return false;
	return DANGEROUS_BASH_PATTERNS.some((pattern) => pattern.test(command));
}

/**
 * Whether a file path is sensitive and should cue attention before a write.
 */
export function sensitivePath(path: string): boolean {
	if (!path) return false;
	return SENSITIVE_PATH_PATTERNS.some((pattern) => pattern.test(path));
}

/**
 * Pick the attention cue for a tool call, or null when no cue is warranted.
 * The warning cue marks a consequential state that needs review; it is never
 * a substitute for the approval flow itself.
 */
export function cueForToolCall(toolName: string, input: Record<string, unknown>): "warning" | null {
	if (toolName === "bash") {
		const command = input.command;
		if (typeof command === "string" && dangerousBashCommand(command)) return "warning";
		return null;
	}
	if (toolName === "write" || toolName === "edit") {
		const path = input.path;
		if (typeof path === "string" && sensitivePath(path)) return "warning";
		return null;
	}
	return null;
}
