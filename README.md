# pi-ui-sfx

Semantic sound effects for [Pi](https://pi.dev) — the terminal AI coding agent.
Powered by the [uisfx](https://uisfx.com) audio library (MIT code, CC0 audio).

Pi is a terminal app, so this extension plays the packaged
`uisfx/sounds/<pack>/<cue>.mp3` assets through the system audio player
(macOS `afplay`, else `ffplay` / `paplay` / Windows PowerShell) instead of the
Web Audio `createUISFX` runtime. The same semantic and lifecycle rules apply:
one shared player, meaningful state transitions only, no autoplay, and a
persisted sound preference.

## Features

- **Semantic cues, not click sounds** — sound maps to what happened, not what a
  control looks like.
- **Sparse by design** — no sound for scrolling, routine tool calls, passive
  layout changes, background refreshes, or session-restore replay.
- **Persisted preference** — enabled state, volume, and pack survive restarts.
- **12 sound packs** — switch personality without changing code.
- **Non-TUI safe** — silent in print / JSON / RPC modes.

## Install

```bash
# From GitHub (cloned under ~/.pi/agent/git/)
pi install git:github.com/limboinf/pi-ui-sfx

# Pin a tag or commit
pi install git:github.com/limboinf/pi-ui-sfx@v1.0.0

# Or from a local checkout (no copy; edits take effect after /reload)
pi install /path/to/pi-ui-sfx
```

## Action → cue map

| Product event | Cue | When |
|---|---|---|
| User submits a prompt | `press` | `input` event, interactive source only |
| Agent starts producing its reply | `receive` | first assistant `message_start` in a run |
| Agent fully settles | `complete` | `agent_settled` (no retry/compaction/follow-up left) |
| Consequential tool call needs review | `warning` | dangerous bash / sensitive write via `tool_call` |
| Tool execution failed | `error` | `tool_execution_end` with `isError` |
| Model changed by the user | `select` | `model_select` with source `set` / `cycle` |
| Entered a session | `open` | `session_start` with reason `new` / `resume` / `fork` |
| Approval outcome (bridge) | `unlock` / `lock` | `pi.events` `uisfx:approval` |

## Sound pack

The default pack is **`scifi`** — "clean holographic pings with a restrained
digital shimmer", catalogued as best for AI tools. Pi is an AI-native terminal
developer tool, so a pack aimed at AI products fits better than `mechanical`
(devtools/hardware) or `minimal` (generic SaaS), without the arcade energy of a
game pack. Every pack ships the same cue names, so `/sound-pack` can switch
without code changes.

## Commands

| Command | Effect |
|---|---|
| `/sound [on|off|status]` | Toggle or inspect the master switch (no args toggles) |
| `/sound-volume <0-100>` | Set master volume |
| `/sound-pack [name]` | List packs, or set one (e.g. `/sound-pack zen`) |

## Sound preference

`~/.pi/ui-sfx.json` stores `enabled`, `volume` (0–1, default 0.7), and `pack`
(default `scifi`). It is written only when a setting changes. Sound reinforces
existing visual feedback and is never the only signal; `prefers-reduced-motion`
is not treated as an audio preference.

## Loops

No loop cues are used. Per product decision there is no sound for continuous
agent work or streaming replies — only discrete state transitions — so there
are no `PlayingSFX` handles to leak. The one-shot `play()` returns a handle
with `stop()` / `ended` that is safe to ignore.

## Approval bridge

Pi exposes no global approval/confirm lifecycle event (`ctx.ui.confirm` is
called directly by each extension, with no broadcast). This extension therefore
cues `warning` at the observable "needs review" moment. Extensions that run
their own approval dialogs can emit the outcome:

```ts
pi.events.emit("uisfx:approval", { outcome: "approved" }); // -> unlock
pi.events.emit("uisfx:approval", { outcome: "declined" }); // -> lock
```

## Layout

```
index.ts     entry point: event listeners + commands
audio.ts     terminal player (afplay / ffplay / paplay / powershell)
config.ts    preference persistence (~/.pi/ui-sfx.json)
cues.ts      cue metadata (volume, pack list)
mapping.ts   pure event -> cue decision logic
test/        node:test suite
```

## Development

Requires Node.js 22+.

```bash
npm install   # installs uisfx (needed by tests and at runtime)
npm test      # node:test, runs via --experimental-strip-types
```

The test suite covers cue mapping, dangerous-command / sensitive-path
detection, config round-trip + corrupt-file fallback + volume clamping, and
asset resolution.

## License

MIT. The bundled audio assets are CC0-1.0, courtesy of
[romainsimon/uisfx](https://github.com/romainsimon/uisfx).
