# Setting up Penthouse HQ (instructions for AI coding agents)

Your user gave you this repo and wants their own HQ running. Follow these steps in order. Ask the user before changing anything outside this folder.

## 1. Install and start

1. Check Node.js is installed (`node --version`). If not, ask the user to install it from nodejs.org. There is no `npm install` step: HQ has no runtime dependencies.
2. Keep this folder somewhere permanent (for example `~/penthouse-hq`), because the hook below points at it.
3. Run `npm start` from this folder. It starts the server in the background and opens the browser. The port is in `.runtime.json` (default 7763).
4. Confirm `http://127.0.0.1:<port>/api/stats` answers with JSON. If the page does not open, read `.server.log` in this folder.

## 2. Open HQ with every Claude Code session (ask the user first)

Add a SessionStart hook to `~/.claude/settings.json`. Back the file up first, then MERGE this entry into the existing `hooks.SessionStart` list. Never replace the user's other hooks.

```json
{ "hooks": [{ "type": "command", "command": "node <absolute path to this folder>/launch.js" }] }
```

Use forward slashes in the path, and quote it if it contains spaces. The launcher opens a tab only when it starts the server.

## 3. Make it theirs

1. Copy `hq.config.example.json` to `hq.config.json`. Edit only `hq.config.json`; it is gitignored, so updates never overwrite it.
2. Ask the user for the HQ name (`appName`), an accent color, their monthly plan price (`planUsd`), and how they want to look (`owner.name`, `owner.look`, `owner.avatar`).
3. Map their agents to desks. List the subagent types they use: files in `~/.claude/agents/` (the `name:` in each file), their plugins' agents (written `plugin:agent`, so `my-plugin:*` matches all of them), and the built-ins (`general-purpose`, `Explore`, `Plan`, `claude-code-guide`, `statusline-setup`). Put each type in some desk's `agentTypes`: an exact type, or a prefix ending in `*`.
4. Rules the config must follow: at most 5 `departments`; at most 5 `agents` per department; unique agent `id`s; each agent's `dept` names a department; no two agents share a `hangout`; `sessionAvatars` lists at least one look.
5. Avatars: copy the vocabulary used in `hq.config.example.json` (`top`: suit, double, blazer, vest, shirt; `hair`: [style, color] with style slick, short, bun, buzz, curly or long; `extras` such as watch, glasses, headset, lanyard). `public/floor/person.js` is the source of truth. Hangout spots are listed in `SPOTS` in `public/floor/life.js`.
6. Validate: `node -e "require('./config').loadConfig()"` prints nothing when the config is valid and an error naming the problem when it is not.
7. Restart so the change shows: end the process whose `pid` is in `.runtime.json`, then `npm start`.

## 4. Updates

Run `git pull` in this folder, then restart as in step 3.7. `hq.config.json` and an optional `assets/boss.glb` are never touched by an update.

## Good to know

- HQ only reads Claude Code's local files under `~/.claude`. It listens on 127.0.0.1, is read-only and makes no network calls.
- **Streamer** (in the top bar) hides every name and task on screen, for recording.
- Costs are API-equivalent estimates from `pricing.js`, not the user's bill. Their exact plan usage is `/usage` in Claude Code.
