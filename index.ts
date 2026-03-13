#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { $ } from "bun";

// Default dump settings - limits scrollback to keep responses fast
const DEFAULT_DUMP_LINES = 100;

interface Pane {
  id: number;
  is_plugin: boolean;
  is_focused: boolean;
  title: string;
  tab_id: number;
  tab_position: number;
  tab_name: string;
}

// Get list of panes directly from Zellij as JSON
async function getPanes(sessionName: string): Promise<Pane[]> {
  try {
    const result = await $`zellij -s ${sessionName} action list-panes --json`.text();
    return JSON.parse(result);
  } catch (e) {
    console.error("Failed to get panes:", e);
    return [];
  }
}

// Helper to get active Zellij session name
async function getActiveSessionName(): Promise<string | null> {
  if (process.env.ZELLIJ_SESSION_NAME) {
    return process.env.ZELLIJ_SESSION_NAME;
  }
  
  try {
    const result = await $`zellij list-sessions 2>/dev/null`.text();
    const lines = result.split('\n');
    for (const line of lines) {
      if (line && !line.includes('EXITED')) {
        const cleanLine = line.replace(/\x1b\[[0-9;]*m/g, '');
        const sessionName = cleanLine.split(/\s+/)[0];
        if (sessionName) return sessionName;
      }
    }
  } catch (e) {
    console.error("Failed to get active session:", e);
  }
  return null;
}

// Parse pane identifier for optional tab prefix
function parseTabPaneQuery(input: string): { tabName: string | null; paneQuery: string; tabIndex: number | null } {
  // Match patterns like "Tab 2 Pane 1", "tab #2 pane #1" (numeric tab reference)
  const numericTabMatch = input.match(/^tab\s*#?\s*(\d+)\s+(.+)$/i);
  if (numericTabMatch) {
    const tabNum = parseInt(numericTabMatch[1], 10);
    const paneQuery = numericTabMatch[2].trim();
    return { tabName: null, paneQuery, tabIndex: tabNum - 1 };
  }
  
  // Match patterns like "workspace Pane 1", "shell pane 2" (named tab reference)
  const namedTabMatch = input.match(/^(\S+)\s+(pane\s*#?\s*\d+|\d+)$/i);
  if (namedTabMatch) {
    const potentialTabName = namedTabMatch[1];
    const paneQuery = namedTabMatch[2].trim();
    if (potentialTabName.toLowerCase() !== 'pane') {
      return { tabName: potentialTabName, paneQuery, tabIndex: null };
    }
  }
  
  return { tabName: null, paneQuery: input, tabIndex: null };
}

// Resolve pane identifier to numeric pane ID
// Accepts: "4", "Pane #4", "terminal_2", "opencode", etc.
function resolvePaneId(pane_id: string, panes: Pane[], tabName?: string | null, tabIndex?: number | null): number | null {
  // Filter by tab if specified
  let filteredPanes = panes.filter(p => !p.is_plugin);
  
  if (tabName) {
    filteredPanes = filteredPanes.filter(p => 
      p.tab_name.toLowerCase() === tabName.toLowerCase()
    );
  } else if (tabIndex !== null && tabIndex !== undefined) {
    filteredPanes = filteredPanes.filter(p => 
      p.tab_position === tabIndex
    );
  }
  
  // If it's terminal_N format, extract N
  if (pane_id.startsWith('terminal_')) {
    const id = parseInt(pane_id.replace('terminal_', ''));
    const pane = filteredPanes.find(p => p.id === id);
    return pane?.id ?? null;
  }
  
  // If it's a plain number like "4", treat as "Pane #4"
  if (/^\d+$/.test(pane_id)) {
    const displayName = `pane #${pane_id}`.toLowerCase();
    const pane = filteredPanes.find(p => 
      p.title.toLowerCase().trim() === displayName
    );
    if (pane) return pane.id;
    
    // Fallback: try to match by numeric ID directly
    const id = parseInt(pane_id);
    const paneById = filteredPanes.find(p => p.id === id);
    return paneById?.id ?? null;
  }
  
  // Try exact match first
  const normalizedInput = pane_id.toLowerCase().trim();
  const exactMatch = filteredPanes.find(p => 
    p.title.toLowerCase().trim() === normalizedInput
  );
  if (exactMatch) return exactMatch.id;
  
  // Partial match fallback
  const partialMatch = filteredPanes.find(p => {
    const normalizedName = p.title.toLowerCase().trim();
    return normalizedName.includes(normalizedInput) || normalizedInput.includes(normalizedName);
  });
  if (partialMatch) return partialMatch.id;
  
  return null;
}

// Helper to get last N lines from content
function limitToLastNLines(content: string, n: number): string {
  const lines = content.split('\n');
  
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }
  
  if (lines.length <= n) {
    return lines.join('\n');
  }
  
  const truncated = lines.slice(-n);
  const omitted = lines.length - n;
  return `[... ${omitted} lines omitted, showing last ${n} lines ...]\n\n${truncated.join('\n')}`;
}

// Create MCP server
const server = new McpServer({
  name: "zellij-pane-mcp",
  version: "1.0.0",
});

// Tool: get_panes - List all panes with their names
server.tool(
  "get_panes",
  "Get list of all Zellij panes with their IDs and names. Use the Zellij display name (e.g., 'Pane #1', 'opencode') to reference panes in other tools.",
  {},
  async () => {
    const sessionName = await getActiveSessionName();
    if (!sessionName) {
      return {
        content: [{ type: "text", text: "Could not determine active Zellij session." }],
      };
    }

    const panes = await getPanes(sessionName);
    const terminalPanes = panes
      .filter(p => !p.is_plugin)
      .sort((a, b) => a.id - b.id)
      .map(p => `terminal_${p.id}: ${p.title} (tab: ${p.tab_name})`)
      .join("\n");

    return {
      content: [
        {
          type: "text",
          text: `Terminal Panes:\n${terminalPanes}\n\nTip: Use the display name (e.g., "Pane #1", "opencode") or terminal ID (e.g., "2", "terminal_2") to reference panes.`,
        },
      ],
    };
  }
);

// Tool: dump_pane - Get content of a specific pane
server.tool(
  "dump_pane",
  `Dump the scrollback content of a specific terminal pane. Can use terminal ID (e.g., '2' or 'terminal_2') or display name (e.g., 'Pane #2', 'opencode').

Supports tab-scoped queries:
- "Pane 1" or "1" → finds across all tabs
- "Tab 2 Pane 1" → searches only in Tab #2
- "shell Pane 1" → searches only in tab named "shell"

By default, returns last ${DEFAULT_DUMP_LINES} lines for faster responses. Use 'full: true' for complete scrollback, or 'lines: N' to customize.`,
  {
    pane_id: z.string().describe("Pane identifier - e.g., '1', 'Pane #1', 'Tab 2 Pane 1', 'opencode', 'terminal_2'"),
    full: z.boolean().optional().describe("If true, dump entire scrollback history (can be slow/large). Default: false"),
    lines: z.number().optional().describe(`Number of lines to return from end of scrollback. Default: ${DEFAULT_DUMP_LINES}. Ignored if 'full' is true.`),
  },
  async ({ pane_id, full = false, lines }) => {
    try {
      const sessionName = await getActiveSessionName();
      if (!sessionName) {
        return { content: [{ type: "text", text: "Could not determine active Zellij session." }] };
      }

      const panes = await getPanes(sessionName);
      const { tabName: requestedTab, paneQuery, tabIndex } = parseTabPaneQuery(pane_id);
      
      const paneId = resolvePaneId(paneQuery, panes, requestedTab, tabIndex);
      
      if (paneId === null) {
        const availablePanes = panes
          .filter(p => !p.is_plugin)
          .map(p => `  terminal_${p.id}: ${p.title} (tab: ${p.tab_name})`)
          .join('\n');
        return {
          content: [{ type: "text", text: `Could not resolve pane '${pane_id}'\n\nAvailable panes:\n${availablePanes}` }],
        };
      }

      const dumpFile = `/tmp/zjmcp-dump-${paneId}.txt`;
      
      // Dump the pane directly using -p flag (numeric ID)
      await (full 
        ? $`zellij -s ${sessionName} action dump-screen --full -p ${paneId} --path ${dumpFile}`
        : $`zellij -s ${sessionName} action dump-screen -p ${paneId} --path ${dumpFile}`
      ).quiet();
      
      let content: string | null = null;
      try {
        const rawContent = await Bun.file(dumpFile).text();
        const lineLimit = lines !== undefined ? lines : DEFAULT_DUMP_LINES;
        content = full ? rawContent : limitToLastNLines(rawContent, lineLimit);
      } catch {
        content = null;
      }
      
      if (!content) {
        return { content: [{ type: "text", text: `Could not dump terminal_${paneId}. Pane may not exist.` }] };
      }
      
      return { content: [{ type: "text", text: content }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: `Failed to dump pane '${pane_id}': ${e.message}` }] };
    }
  }
);

// Tool: run_in_pane - Run a command in a specific pane
server.tool(
  "run_in_pane",
  `Run a shell command in a specific pane using direct pane targeting (no focus switching).

Supports tab-scoped queries:
- "Pane 1" or "1" → finds across all tabs
- "Tab 2 Pane 1" → searches only in Tab #2
- "shell Pane 1" → searches only in tab named "shell"`,
  {
    pane_id: z.string().describe("Pane identifier - e.g., '1', 'Pane #1', 'Tab 2 Pane 1', 'opencode', 'terminal_2'"),
    command: z.string().describe("Command to run"),
  },
  async ({ pane_id, command }) => {
    try {
      const sessionName = await getActiveSessionName();
      if (!sessionName) {
        return { content: [{ type: "text", text: "Could not determine active Zellij session." }] };
      }

      const panes = await getPanes(sessionName);
      const { tabName: requestedTab, paneQuery, tabIndex } = parseTabPaneQuery(pane_id);
      
      const paneId = resolvePaneId(paneQuery, panes, requestedTab, tabIndex);
      
      if (paneId === null) {
        return { content: [{ type: "text", text: `Could not resolve pane '${pane_id}'` }] };
      }
      
      // Write the command directly to the pane using -p flag (numeric ID)
      const bytes = [...command].map(c => c.charCodeAt(0));
      await $`zellij -s ${sessionName} action write ${bytes} 10 -p ${paneId}`.quiet();
      // The 10 in the end is \n
      
      return { content: [{ type: "text", text: `Executed in terminal_${paneId}: ${command}` }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: `Failed to run command in pane ${pane_id}: ${e.message}` }] };
    }
  }
);

// Tool: new_pane - Create a new pane
server.tool(
  "new_pane",
  "Create a new terminal pane",
  {
    direction: z.enum(["down", "right"]).optional().describe("Direction to split (default: down)"),
    command: z.string().optional().describe("Optional command to run in new pane"),
  },
  async ({ direction = "down", command }) => {
    try {
      const sessionName = await getActiveSessionName();
      if (!sessionName) {
        return { content: [{ type: "text", text: "Could not determine active Zellij session." }] };
      }
      
      if (command) {
        await $`zellij -s ${sessionName} action new-pane -d ${direction} -- ${command}`.quiet();
      } else {
        await $`zellij -s ${sessionName} action new-pane -d ${direction}`.quiet();
      }
      return {
        content: [{ type: "text", text: `Created new pane (${direction})${command ? ` running: ${command}` : ""}` }],
      };
    } catch (e: any) {
      return { content: [{ type: "text", text: `Failed to create pane: ${e.message}` }] };
    }
  }
);

// Tool: rename_session - Rename current Zellij session
server.tool(
  "rename_session",
  "Rename the current Zellij session",
  { name: z.string().describe("New session name") },
  async ({ name }) => {
    try {
      const sessionName = await getActiveSessionName();
      if (!sessionName) {
        return { content: [{ type: "text", text: "Could not determine active Zellij session." }] };
      }
      
      await $`zellij -s ${sessionName} action rename-session ${name}`.quiet();
      return { content: [{ type: "text", text: `Session renamed to: ${name}` }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: `Failed to rename session: ${e.message}` }] };
    }
  }
);

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Zellij Pane MCP server v1.0.0 running on stdio");
}

main().catch(console.error);

// v1.0.0 - MAJOR: Use native 'zellij action list-panes --json' instead of plugin
//          Removed dependency on plugin (WASM) and zjdump script
//          Now uses only native Zellij CLI commands with JSON output
//          Simplified pane resolution using tab info from JSON
// v0.9.0 - REFACTOR: Use -p flag for write and dump-screen (no pane switching)
// v0.8.0 - FIX: "Pane N" falls back to all tabs, added return verification
// v0.7.0 - BREAKING: "Pane N" only searches current tab
// v0.6.1 - Support named tabs
// v0.6.0 - Tab-scoped pane queries
// v0.5.0 - Optimized return navigation
// v0.4.0 - Smart dump limiting
