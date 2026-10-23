#!/usr/bin/env bun
/**
 * scripts/mcp-server.ts
 *
 * Native Model Context Protocol (MCP) server for Synapse.
 * Exposes Synapse's full-text search, unread queue, Markdown extraction,
 * and triage capabilities to AI assistants (Claude Desktop, Antigravity, Cursor).
 *
 * Communication: JSON-RPC 2.0 over standard I/O (stdin/stdout).
 * Zero external dependencies — runs directly on Bun / Node.
 *
 * Usage:
 *   bun scripts/mcp-server.ts
 *   or via package.json script:
 *   bun run mcp
 */

import * as readline from "readline";

const SYNAPSE_URL = (process.env.SYNAPSE_URL || "http://127.0.0.1:3005").replace(/\/$/, "");
const SYNAPSE_API_KEY = process.env.SYNAPSE_API_KEY || "";

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "Synapse-MCP-Server/1.0",
  };
  if (SYNAPSE_API_KEY) {
    headers["Authorization"] = `Bearer ${SYNAPSE_API_KEY}`;
  }
  return headers;
}

// Tool definitions conforming to MCP standard
const TOOLS = [
  {
    name: "synapse_search",
    description:
      "Perform a full-text FTS5 search across all articles in the user's Synapse reading library.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search keywords (e.g. 'reasoning models', 'zero trust', 'rust')",
        },
        category: {
          type: "string",
          description: "Optional category filter (e.g. 'Technology', 'Cybersecurity')",
        },
        limit: {
          type: "number",
          description: "Maximum number of results to return (default 10, max 50)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "synapse_get_unread",
    description: "Fetch articles from the user's unread queue in Synapse.",
    inputSchema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description: "Optional category filter (e.g. 'Technology', 'Business')",
        },
        limit: {
          type: "number",
          description: "Maximum articles to return (default 10)",
        },
      },
    },
  },
  {
    name: "synapse_get_markdown",
    description:
      "Fetch an article converted into clean, token-efficient Markdown with YAML frontmatter, stripped of ads and navigation.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The unique ID of the article in Synapse",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "synapse_triage",
    description:
      "Triage an article in Synapse by marking it as read/unread, starred (Read Later), or flagged for the team/work digest.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The unique ID of the article in Synapse",
        },
        action: {
          type: "string",
          enum: ["mark_read", "mark_unread", "star", "unstar", "flag_work", "unflag_work"],
          description: "The triage action to perform on the article",
        },
      },
      required: ["id", "action"],
    },
  },
  {
    name: "synapse_list_feeds",
    description: "List all active RSS/Atom/YouTube feeds subscribed in Synapse with unread counts.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

// Tool Executors
async function executeTool(name: string, args: Record<string, any>) {
  try {
    switch (name) {
      case "synapse_search": {
        const params = new URLSearchParams();
        params.set("q", args.query);
        if (args.category) params.set("category", args.category);
        params.set("limit", String(args.limit || 10));

        const res = await fetch(`${SYNAPSE_URL}/api/items?${params.toString()}`, {
          headers: getHeaders(),
        });
        const data = await res.json();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data.items || [], null, 2),
            },
          ],
        };
      }

      case "synapse_get_unread": {
        const params = new URLSearchParams();
        params.set("unreadOnly", "true");
        if (args.category) params.set("category", args.category);
        params.set("limit", String(args.limit || 10));

        const res = await fetch(`${SYNAPSE_URL}/api/items?${params.toString()}`, {
          headers: getHeaders(),
        });
        const data = await res.json();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data.items || [], null, 2),
            },
          ],
        };
      }

      case "synapse_get_markdown": {
        const res = await fetch(
          `${SYNAPSE_URL}/api/items/${encodeURIComponent(args.id)}/markdown`,
          {
            headers: getHeaders(),
          }
        );
        if (!res.ok) {
          throw new Error(`Failed to fetch article markdown: HTTP ${res.status}`);
        }
        const text = await res.text();
        return {
          content: [
            {
              type: "text",
              text,
            },
          ],
        };
      }

      case "synapse_triage": {
        const payload: Record<string, any> = { id: args.id };
        if (args.action === "mark_read") payload.isRead = true;
        if (args.action === "mark_unread") payload.isRead = false;
        if (args.action === "star") payload.isStarred = true;
        if (args.action === "unstar") payload.isStarred = false;
        if (args.action === "flag_work") payload.isWork = true;
        if (args.action === "unflag_work") payload.isWork = false;

        const res = await fetch(`${SYNAPSE_URL}/api/items`, {
          method: "PATCH",
          headers: getHeaders(),
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      }

      case "synapse_list_feeds": {
        const res = await fetch(`${SYNAPSE_URL}/api/feeds`, {
          headers: getHeaders(),
        });
        const data = await res.json();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data.feeds || [], null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err: any) {
    return {
      content: [
        {
          type: "text",
          text: `Error executing ${name}: ${err.message}`,
        },
      ],
      isError: true,
    };
  }
}

// JSON-RPC Stdin/Stdout handler
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

rl.on("line", async (line) => {
  if (!line.trim()) return;

  let request: any;
  try {
    request = JSON.parse(line);
  } catch {
    return;
  }

  const { id, method, params } = request;

  // Notification (no ID, no response required)
  if (method === "notifications/initialized") {
    return;
  }

  // Handle Methods
  let result: any = null;
  let error: any = null;

  try {
    if (method === "initialize") {
      result = {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: "synapse-mcp",
          version: "1.0.0",
        },
      };
    } else if (method === "tools/list") {
      result = {
        tools: TOOLS,
      };
    } else if (method === "tools/call") {
      const { name, arguments: args } = params || {};
      result = await executeTool(name, args || {});
    } else {
      error = {
        code: -32601,
        message: `Method not found: ${method}`,
      };
    }
  } catch (err: any) {
    error = {
      code: -32603,
      message: err.message,
    };
  }

  const response: any = {
    jsonrpc: "2.0",
    id,
  };

  if (error) {
    response.error = error;
  } else {
    response.result = result;
  }

  process.stdout.write(JSON.stringify(response) + "\n");
});
