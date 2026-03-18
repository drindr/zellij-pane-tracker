# Zellij Pane MCP

An MCP (Model Context Protocol) server that lets AI assistants see and interact with your Zellij terminal panes.

## What It Does

AI coding assistants running in a terminal pane are blind to other panes. This MCP server fixes that by exposing Zellij pane operations via the [Model Context Protocol](https://modelcontextprotocol.io/).

Your AI assistant can now:
- **See** what panes exist and what they're named
- **Read** the scrollback content of any pane
- **Run** commands in other panes
- **Create** new panes
- **Rename** sessions

## Requirements

- Zellij 0.44.0+ (must support `zellij action list-panes --json`)
- [Bun](https://bun.sh/) runtime

> ⚠️ **WARNING:** Zellij 0.44.0 has not been released yet (as of 2025/03/18). This MCP server requires the `--json` flag for `zellij action list-panes`, which is only available in the upcoming 0.44.0 release. You can build from source or wait for the official release.

## Quick Start

### 1. Install

```bash
git clone https://github.com/theslyprofessor/zellij-pane-tracker
cd zellij-pane-tracker
bun install
```

### 2. Configure Your AI Tool

Add to your MCP config (e.g., `~/.config/opencode/opencode.json`):

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

### 3. Restart Your AI Tool

The AI now has these capabilities:

| Tool | Description |
|------|-------------|
| `zellij_get_panes` | List all panes with IDs and display names |
| `zellij_dump_pane` | Get scrollback of any pane (default: last 100 lines) |
| `zellij_run_in_pane` | Execute commands in other panes |
| `zellij_new_pane` | Create new panes |
| `zellij_rename_session` | Rename the Zellij session |

## Usage Examples

### Pane Identification

Use any of these formats:
- Plain numbers: `"4"` → finds "Pane #4"
- Display names: `"Pane #1"`, `"opencode"`, `"nvim"`
- Terminal IDs: `"terminal_2"` or just `"2"`
- Tab-scoped: `"Tab 2 Pane 1"` or `"shell Pane 1"`

### dump_pane Options

```typescript
zellij_dump_pane("4")              // Last 100 lines of Pane #4
zellij_dump_pane("4", full=true)   // Entire scrollback
zellij_dump_pane("4", lines=50)    // Last 50 lines
zellij_dump_pane("Tab 2 Pane 1")   // Pane in specific tab
```

### run_in_pane

```typescript
zellij_run_in_pane("Pane #2", "bun test")
zellij_run_in_pane("2", "npm run build")
```

## How It Works

```
┌─────────────────────────────────────────────────────────┐
│                   Zellij Session                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │terminal_0│  │terminal_1│  │terminal_2│              │
│  │  opencode│  │ npm build│  │   nvim   │              │
│  └────┬─────┘  └──────────┘  └──────────┘              │
│       │                                                 │
│       │ zellij action list-panes --json                 │
│       ▼                                                 │
│  ┌─────────────────────────────────────────┐           │
│  │         MCP Server (this project)       │           │
│  │   - get_panes: list all panes           │           │
│  │   - dump_pane: read pane content        │           │
│  │   - run_in_pane: execute commands       │           │
│  └─────────────────────────────────────────┘           │
│       │                                                 │
│       │ MCP Protocol                                    │
│       ▼                                                 │
│  ┌─────────────────────────────────────────┐           │
│  │      AI Assistant (OpenCode, etc.)      │           │
│  └─────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────┘
```

The server uses native Zellij CLI commands:
- `zellij action list-panes --json` - Get pane metadata
- `zellij action dump-screen -p <id>` - Read pane content
- `zellij action write -p <id>` - Send commands to panes

## Example Conversation

```
User: "What's in my other panes?"
AI: [calls zellij_get_panes]
    "You have 3 panes: terminal_0 (opencode), 
     terminal_1 (Pane #1 - npm run dev), 
     terminal_2 (Pane #2 - nvim)"

User: "Check the npm pane"
AI: [calls zellij_dump_pane("Pane #1")]
    "The build is running - shows 'Compiled successfully'"

User: "Show me the full build log"
AI: [calls zellij_dump_pane("Pane #1", full=true)]
    "Here's the complete output (247 lines)..."

User: "Run tests in pane 2"
AI: [calls zellij_run_in_pane("2", "bun test")]
    "Executed 'bun test' in terminal_2"
```

## Project Structure

```
zellij-pane-tracker/
├── index.ts          # MCP server (TypeScript/Bun)
├── package.json      # Dependencies and metadata
├── bun.lock          # Lock file
├── README.md         # This file
├── LICENSE           # MIT license
└── AGENTS.md         # Documentation for AI agents
```

## License

MIT

## Author

This repository is a continuation of the original work by Nakul Tiruviluamala ([@theslyprofessor](https://github.com/theslyprofessor)). It is now maintained independently as the primary source for this project.

---

**Note:** This project previously included a Zellij plugin and companion script. As of v1.0.0, it uses only native Zellij CLI commands (`zellij action list-panes --json`) and no longer requires a plugin.


