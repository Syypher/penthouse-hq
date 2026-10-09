# Penthouse HQ

A live headquarters for your Claude Code work. HQ reads the transcripts Claude Code already keeps on your machine and shows them two ways:

- **Dashboard:** every live session and subagent, what each one is doing, who works with whom, and an API-equivalent cost view (spend against your plan, by project, by day, top tools, cache savings).
- **The Penthouse:** a 3D office where each kind of subagent has a desk, a look and a department. Agents sit down to work while they run and wander the floor when idle.

Everything stays on your machine. The server listens on 127.0.0.1 only, is read-only, and makes no network calls.

## Requirements

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (HQ reads `~/.claude/projects`)
- Node.js (tested on Node 24). No `npm install` needed to run it: there are no runtime dependencies.
- A browser with WebGL for the Penthouse view

## Quick start

```sh
git clone <this repo> penthouse-hq
cd penthouse-hq
npm start
```

`npm start` starts the server in the background and opens HQ at `http://127.0.0.1:7763` (or the next free port). Running it again while HQ is up does nothing. To stop HQ, end the process whose `pid` is in `.runtime.json`.

## Open HQ with every Claude Code session (optional)

Add a SessionStart hook to `~/.claude/settings.json` (merge it into your existing `hooks` if you have some):

```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "node /path/to/penthouse-hq/launch.js" }] }
    ]
  }
}
```

The launcher opens a tab only when it starts the server, so new sessions never pile up tabs.

## Make it yours

Copy `hq.config.example.json` to `hq.config.json` (gitignored) and edit it:

- `appName`, `accent`: the name and color in the header
- `planUsd`: your monthly plan price, for the spend comparison
- `owner`: your name and avatar
- `departments` (up to 5) and `agents` (up to 5 per department): each desk's name, look, hangout spot and `agentTypes`

`agentTypes` decides which subagents sit at which desk: an exact type (`Explore`, `Plan`, `general-purpose`) or a prefix ending in `*` (`security*`, `my-plugin:*`). HQ checks the config at start and refuses one that does not fit the floor, with a message saying why.

## Recording videos

Press **Streamer** (top bar, or in the Penthouse) to hide every session name, project name and task on screen. **Full screen** in the Penthouse hides the browser chrome.

## About the costs

HQ prices your tokens at Anthropic's API list prices (`pricing.js`). On a subscription plan you are not billed this amount: it shows what the same work would cost through the API. For your exact plan usage, run `/usage` in Claude Code.

## Development

```sh
npm test       # unit tests, no install needed
npm install    # only for the browser smoke tools in tools/
```

The smoke tools drive Chromium through `playwright-core`. They default to Microsoft Edge's Windows install path; set `HQ_BROWSER` to a Chrome or Chromium executable elsewhere.

## License

MIT. Three.js, vendored in `vendor/three`, is MIT licensed by its authors (see `vendor/three/LICENSE`).
