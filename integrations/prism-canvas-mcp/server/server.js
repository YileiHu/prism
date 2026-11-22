#!/usr/bin/env node
"use strict";

// Minimal Model Context Protocol (stdio) server for Prism whiteboards.
//
// It speaks the 2025-era JSON-RPC handshake on purpose: modern clients probe
// `server/discover` first and fall back to `initialize` when it is not
// implemented, which keeps this server compatible with DSH, Claude Desktop and
// other MCP clients without pulling in the official SDK.
//
// Transport: newline-delimited JSON-RPC 2.0 on stdin/stdout. Diagnostics go to
// stderr only, so stdout stays a clean protocol channel.

const readline = require("node:readline");
const { tools } = require("./tools.js");

const SERVER_INFO = { name: "prism-canvas", version: "1.0.0" };
const DEFAULT_PROTOCOL_VERSION = "2025-06-18";
const LEGACY_PROTOCOL = /^(2024|2025)-\d{2}-\d{2}$/;
const INSTRUCTIONS = [
  "Prism is a local knowledge app. A Prism whiteboard is a plain CanvasDoc v2 JSON file under <vault>/<canvas_dir>/ (usually <vault>/canvases/).",
  "Use these tools to create or change whiteboards that the user then reads and edits in Prism under 资料库 → 白板; a newly written file appears after switching to that view or restarting Prism.",
  "Every tool needs an explicit vault: call canvas_vaults when the user did not name one, then use the vault's `name`. Private vaults are encrypted and refused.",
  "Design boards as cards plus arrows: canvas_create takes nodes with local `key`s and edges with from/to keys. Prefer layout mode \"mindmap\" for one central topic, \"tree\" for outlines, \"grid\" for flat lists. Omit x/y to let the server place cards.",
  "Refine a board with canvas_edit after canvas_read: node and edge ids come from the read result. Use canvas_layout to re-flow an existing board.",
  "Limits: no deletion of whole boards, no private vaults, and if Prism has the same board open, external writes surface as Prism's reload/overwrite conflict on the next save.",
].join("\n");

function createProtocol(write) {
  const send = (message) => write(`${JSON.stringify(message)}\n`);

  const reply = (id, result) => send({ jsonrpc: "2.0", id, result });
  const fail = (id, code, message, data) => {
    const error = { code, message };
    if (data !== undefined) error.data = data;
    send({ jsonrpc: "2.0", id, error });
  };

  const runTool = (name, args) => {
    const tool = tools.find((candidate) => candidate.name === name);
    if (!tool) {
      return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
    try {
      return tool.handler(args && typeof args === "object" ? args : {});
    } catch (error) {
      const code = error && error.code ? error.code : "TOOL_ERROR";
      const details = error && error.details ? `\n${JSON.stringify(error.details)}` : "";
      return {
        content: [{ type: "text", text: `${code}: ${error && error.message ? error.message : String(error)}${details}` }],
        isError: true,
      };
    }
  };

  const handleRequest = (id, method, params) => {
    switch (method) {
      case "server/discover":
        // Deliberate: no modern era, so the client falls back to initialize.
        fail(id, -32601, "Method not found: server/discover (legacy initialize server)");
        return;
      case "initialize": {
        const requested = params && typeof params.protocolVersion === "string" ? params.protocolVersion : "";
        reply(id, {
          protocolVersion: LEGACY_PROTOCOL.test(requested) ? requested : DEFAULT_PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: INSTRUCTIONS,
        });
        return;
      }
      case "ping":
        reply(id, {});
        return;
      case "tools/list":
        reply(id, {
          tools: tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          })),
        });
        return;
      case "tools/call": {
        const name = params && typeof params.name === "string" ? params.name : "";
        const args = params && params.arguments && typeof params.arguments === "object" ? params.arguments : {};
        if (!name) {
          fail(id, -32602, "Invalid params: tools/call requires a tool name");
          return;
        }
        reply(id, runTool(name, args));
        return;
      }
      case "resources/list":
        reply(id, { resources: [] });
        return;
      case "resources/templates/list":
        reply(id, { resourceTemplates: [] });
        return;
      case "prompts/list":
        reply(id, { prompts: [] });
        return;
      default:
        fail(id, -32601, `Method not found: ${method}`);
    }
  };

  const handleMessage = (message) => {
    if (Array.isArray(message)) {
      for (const item of message) handleMessage(item);
      return;
    }
    if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") return;
    const hasId = message.id !== undefined && message.id !== null;
    if (!hasId) {
      // notifications/initialized, notifications/cancelled, ... need no answer.
      return;
    }
    handleRequest(message.id, message.method, message.params);
  };

  return { handleMessage };
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(
      [
        "prism-canvas MCP server (stdio)",
        "",
        "Usage: node server.js [--help]",
        "",
        "Reads the vault list from Prism's settings database (or PRISM_CANVAS_VAULTS).",
        "Environment overrides:",
        "  PRISM_USER_DATA   Prism userData folder (default: %APPDATA%\\prism)",
        "  PRISM_DB          Explicit prism.db path",
        "  PRISM_CANVAS_DIR  Canvas folder inside a vault (default: canvases)",
        "  PRISM_CANVAS_VAULTS  JSON array [{name,path,private?}] that replaces the database lookup",
      ].join("\n") + "\n",
    );
    return;
  }

  const protocol = createProtocol((line) => process.stdout.write(line));
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let message;
    try {
      message = JSON.parse(trimmed);
    } catch (error) {
      process.stderr.write(`prism-canvas: bad JSON input: ${error.message}\n`);
      return;
    }
    try {
      protocol.handleMessage(message);
    } catch (error) {
      process.stderr.write(`prism-canvas: handler failed: ${error && error.stack ? error.stack : error}\n`);
    }
  });
  rl.on("close", () => {
    process.exitCode = 0;
  });
}

process.on("uncaughtException", (error) => {
  process.stderr.write(`prism-canvas: uncaught: ${error && error.stack ? error.stack : error}\n`);
});
process.on("unhandledRejection", (error) => {
  process.stderr.write(`prism-canvas: unhandled rejection: ${error && error.stack ? error.stack : error}\n`);
});

if (require.main === module) main();

module.exports = { createProtocol };
