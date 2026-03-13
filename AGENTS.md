---
created: 2025-12-07T13:45:00-0800
updated: 2025-03-13T14:00:00-0800
slug: zellij-pane-mcp
keywords: zellij, mcp, pane, terminal, ai-assistant, model-context-protocol
---
# Zellij Pane MCP Server

An MCP (Model Context Protocol) server that gives AI assistants visibility into Zellij terminal panes.

## Quick Context

**What it does:** Exposes Zellij pane operations to AI assistants via MCP protocol

**Why:** AI assistants running in a terminal pane are blind to other panes

**Status:** ✅ **FULLY WORKING** - Uses native Zellij CLI commands (no plugin required)

## Requirements

- Zellij 0.40.0+ (must support `zellij action list-panes --json`)
- [Bun](https://bun.sh/) runtime

## Installation

```bash
git clone https://github.com/theslyprofessor/zellij-pane-tracker
cd zellij-pane-tracker
bun install
```

## MCP Configuration

Add to your AI tool's MCP config (e.g., `~/.config/opencode/opencode.json`):

```json
{
  "mcp": {
    "zellij": {
      "type": "local",
      "command": ["bun", "run", "/path/to/zellij-pane-tracker/index.ts"],
      "enabled": true
    }
  }
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `zellij_get_panes` | List all panes with IDs and display names |
| `zellij_dump_pane` | Get scrollback of any pane (default: last 100 lines) |
| `zellij_run_in_pane` | Execute commands in other panes |
| `zellij_new_pane` | Create new panes |
| `zellij_rename_session` | Rename the Zellij session |

## Pane Identification

- `"Pane 1"` or `"1"` → finds "Pane #1" across all tabs
- `"Tab 2 Pane 1"` → searches only in Tab #2
- `"shell Pane 1"` → searches only in tab named "shell"
- `"opencode"` → finds by title
- `"terminal_2"` → explicit terminal ID

## dump_pane Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `pane_id` | string | required | Pane identifier |
| `full` | boolean | false | Dump entire scrollback |
| `lines` | number | 100 | Lines from end to return |

## How It Works

Uses native Zellij CLI commands:

```
zellij action list-panes --json    # Get pane metadata (id, title, tab, etc.)
zellij action dump-screen -p <id>  # Read pane content
zellij action write -p <id>        # Send commands to panes
```

No plugin, no companion scripts - just the MCP server using Zellij's native APIs.

## Development

**Critical:** After editing `index.ts`, kill the MCP process:

```bash
pkill -f "bun.*zellij-pane-tracker/index.ts"
```

OpenCode spawns the MCP server as a child process. It won't pick up changes until restarted.

## Version History

- **v1.0.0** - MAJOR: Removed plugin dependency, uses native `zellij action list-panes --json`
- **v0.9.0** - Use `-p` flag for direct pane targeting (no navigation)
- **v0.8.0** - Tab-scoped queries, return verification
- **v0.7.0** - Breaking: "Pane N" only searches current tab
- **v0.6.0** - Initial tab-scoped support
- **v0.5.0** - Optimized navigation
- **v0.4.0** - Smart dump limiting

## For AI Agents

This project is now a **pure MCP server** - no Rust plugin, no companion scripts.

If you're an AI agent working on this:
- Main file: `index.ts` (TypeScript/Bun)
- Uses `zellij action list-panes --json` for pane discovery
- Uses `-p` flag for all pane operations (no focus switching)
- Always run the pkill command after making changes

## Related

- `~/.config/terminal/AGENTS.md` - Terminal/Zellij context
