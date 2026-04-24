# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository purpose

This repo (`system-prompts-and-models-of-ai-tools`) is a **documentation-only archive** of system prompts, agent instructions, and tool/function schemas extracted from commercial and open-source AI coding assistants. There is **no source code, build system, test suite, package manifest, or runtime** — every artifact is a static text/JSON/YAML file meant to be read, diffed, or compared.

Because there is nothing to build or run, typical "dev workflow" commands do not apply. Work in this repo is almost entirely:

- Adding a new vendor directory with newly leaked/published prompts.
- Updating an existing prompt file when a vendor ships a new version.
- Renaming or reorganizing existing files.
- Touching `README.md` metadata (latest-update date, sponsor/contact info).

## Layout conventions

The repository is organized as **one top-level directory per vendor/tool**, with a few grouping exceptions:

- `Anthropic/`, `Google/`, and `Open Source prompts/` contain **nested subdirectories** per product (e.g. `Anthropic/Claude Code/`, `Google/Antigravity/`, `Open Source prompts/Codex CLI/`). When adding a prompt for a product from one of these vendors, put it under the vendor folder rather than creating a new top-level directory.
- All other vendors (Cursor Prompts, Devin AI, Windsurf, Replit, Lovable, v0 Prompts and Tools, Kiro, Augment Code, Trae, Warp.dev, Cluely, Orchids.app, Junie, VSCode Agent, Xcode, Perplexity, Manus Agent Tools & Prompt, NotionAi, Poke, Qoder, Same.dev, Z.ai Code, Leap.new, Emergent, Traycer AI, CodeBuddy Prompts, Comet Assistant, dia, Amp, etc.) live as **flat top-level directories**.
- `assets/` holds image assets referenced from README/markdown; it is not a vendor.
- `.github/` currently only contains `FUNDING.yml`. There is no CI workflow.

### File naming inside a vendor directory

Naming is not strictly uniform, but the prevailing patterns are:

- **Prompts** → `Prompt.txt`, or a descriptive name like `Agent Prompt.txt`, `Chat Prompt.txt`, `System Prompt.txt`, `Builder Prompt.txt`. Variants per mode (e.g. Kiro's `Spec_Prompt.txt`, `Vibe_Prompt.txt`) or per model (e.g. VSCode Agent's `claude-sonnet-4.txt`, `gpt-5.txt`, `gemini-2.5-pro.txt`) are common.
- **Tool / function schemas** → `Tools.json` or `<Mode> Tools.json` (e.g. `Agent Tools.json`, `Builder Tools.json`). These are the JSON schemas the agent is given for tool use.
- **Versioned/dated prompts** keep history rather than overwriting — e.g. `Cursor Prompts/Agent Prompt 2025-09-03.txt` and `Agent CLI Prompt 2025-08-07.txt` coexist with older `Agent Prompt v1.0.txt`, `Agent Prompt v1.2.txt`, `Agent Prompt 2.0.txt`. When a vendor publishes a newer prompt, prefer **adding a dated/versioned file** alongside the old one rather than overwriting, unless the existing file uses a single canonical name like `Prompt.txt` (in which case update it in place — see git history for this pattern).
- **Amp** is the outlier: it stores prompts as `.yaml` (`claude-4-sonnet.yaml`, `gpt-5.yaml`) and has its own `README.md`.

### When adding a new vendor

1. Create a new top-level directory named after the product (title case, spaces allowed — e.g. `Comet Assistant`, `Z.ai Code`).
2. Place the raw prompt as `Prompt.txt` (or more specific name if the vendor ships multiple modes) and any tool schema as `Tools.json`.
3. Do **not** reformat, translate, or editorialize the prompt content — these files are intended to preserve the vendor's text verbatim.

## Commits, branches, and README hygiene

- The `README.md` contains a `**Latest Update:** MM/DD/YYYY` line. By convention, commits that refresh prompts bump this date (see commits like `48f777a Update latest update date in README`).
- Commit messages in this repo are short and literal — e.g. `Update Prompt.txt`, `Update README.md`, `Rename claude-sonnet-4.6.txt to Claude Sonnet 4.6.txt`. Follow that style; do not inflate with conventional-commits prefixes or multi-line bodies.
- This session works on branch `claude/add-claude-documentation-PzKRc` per the harness instructions — develop and push there, not `main`.

## What not to do

- Do not add linters, formatters, CI configs, `package.json`, or build tooling unless the user explicitly asks — they have no purpose in a text-archive repo and would be noise.
- Do not "fix" typos, grammar, or formatting inside vendor prompt files. They are primary-source artifacts; their imperfections are part of the data.
- Do not consolidate or restructure existing vendor directories without being asked; consumers and external tools (DeepWiki, Cloudback badge in README) link against the current paths.
