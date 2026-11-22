#!/usr/bin/env node
// End-to-end check for the Prism canvas MCP server over its real JSON-RPC
// handlers. It creates a throwaway vault, exercises every tool, then verifies
// the written JSON with Prism's own parser.
//
//   node scripts/ai/canvas-mcp/self-test.mjs
//
// The protocol is driven in-process rather than through a spawned stdio child
// because the DSH Windows sandbox forbids piped child processes; DSH itself
// exercises the real stdio transport once the bundle is installed.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.join(here, "server");
const require = createRequire(import.meta.url);
const { createProtocol } = require(path.join(serverDir, "server.js"));
const { parseCanvas } = require(path.join(serverDir, "lib/model.js"));

const vault = fs.mkdtempSync(path.join(os.tmpdir(), "prism-canvas-test-"));
process.env.PRISM_CANVAS_VAULTS = JSON.stringify([{ name: "TestVault", path: vault }]);
process.env.PRISM_CANVAS_DIR = "canvases";

const failures = [];
const outbox = [];
const protocol = createProtocol((line) => outbox.push(JSON.parse(line)));
let nextId = 1;

function check(label, condition, extra) {
  if (condition) {
    console.log(`ok   ${label}`);
  } else {
    failures.push(label);
    console.error(`FAIL ${label}${extra ? `: ${extra}` : ""}`);
  }
}

function request(method, params) {
  const id = nextId++;
  const message = { jsonrpc: "2.0", id, method };
  if (params !== undefined) message.params = params;
  outbox.length = 0;
  protocol.handleMessage(message);
  const response = outbox.find((item) => item.id === id);
  if (!response) throw new Error(`no response for ${method}`);
  return response;
}

function notify(method) {
  outbox.length = 0;
  protocol.handleMessage({ jsonrpc: "2.0", method });
  return outbox;
}

function call(name, args) {
  return request("tools/call", { name, arguments: args });
}

function contentOf(message) {
  return message.result?.content?.[0]?.text ?? "";
}

function parseContent(message) {
  const text = contentOf(message);
  try {
    return JSON.parse(text);
  } catch {
    return { rawText: text };
  }
}

function overlappingPairs(nodes) {
  const pairs = [];
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i];
      const b = nodes[j];
      const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      if (overlapX > 2 && overlapY > 2) pairs.push(`${a.text} / ${b.text}`);
    }
  }
  return pairs;
}

function run() {
  const discover = request("server/discover", {});
  check("server/discover falls back to legacy", discover.error?.code === -32601, JSON.stringify(discover));

  const init = request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "self-test", version: "0.0.1" },
  });
  check("initialize returns tools capability", init.result?.capabilities?.tools !== undefined, JSON.stringify(init));
  check("initialize echoes protocol version", init.result?.protocolVersion === "2025-06-18");
  check("initialize ships instructions", typeof init.result?.instructions === "string" && init.result.instructions.length > 100);
  check("initialized notification produces no reply", notify("notifications/initialized").length === 0);

  const list = request("tools/list", {});
  const names = (list.result?.tools ?? []).map((tool) => tool.name);
  check(
    "tools/list exposes the canvas tools",
    ["canvas_vaults", "canvas_list", "canvas_read", "canvas_create", "canvas_edit", "canvas_layout"].every((name) =>
      names.includes(name),
    ),
    names.join(","),
  );

  const vaults = parseContent(call("canvas_vaults", {}));
  check("canvas_vaults finds the test vault", vaults.vaults?.[0]?.name === "TestVault", JSON.stringify(vaults));

  const missingVault = call("canvas_list", {});
  check("missing vault is reported, not defaulted", missingVault.result?.isError === true, JSON.stringify(missingVault));

  const empty = parseContent(call("canvas_list", { vault: "TestVault" }));
  check("canvas_list starts empty", Array.isArray(empty.canvases) && empty.canvases.length === 0);

  const created = call("canvas_create", {
    vault: "TestVault",
    title: "编译器概览",
    layout: { mode: "mindmap" },
    nodes: [
      { key: "root", text: "编译器", color: "#c75b4a", fontSize: 22, bold: true },
      { key: "front", text: "前端", fontSize: 18, bold: true },
      { key: "lex", text: "词法分析", notes: "把字符流切成 token" },
      { key: "parse", text: "语法分析" },
      { key: "back", text: "后端", fontSize: 18, bold: true },
      { key: "opt", text: "优化" },
      { key: "codegen", text: "代码生成" },
    ],
    edges: [
      { from: "root", to: "front" },
      { from: "front", to: "lex", label: "第一步" },
      { from: "front", to: "parse" },
      { from: "root", to: "back" },
      { from: "back", to: "opt" },
      { from: "back", to: "codegen", lineStyle: "dashed" },
    ],
    groups: [{ name: "后端流水线", nodes: ["back", "opt", "codegen"], color: "#4a7fc7" }],
  });
  check("canvas_create succeeds", created.result?.isError !== true, contentOf(created));
  const createdData = parseContent(created);
  check("canvas_create reports a path under canvases", String(createdData.path ?? "").includes(`${path.sep}canvases${path.sep}`));

  const canvasPath = createdData.path;
  check("canvas file exists", Boolean(canvasPath) && fs.existsSync(canvasPath));
  const raw = fs.readFileSync(canvasPath, "utf8");
  const parsed = parseCanvas(raw);
  check("written JSON parses as CanvasDoc v2", !parsed.corrupt && parsed.migrated === false, JSON.stringify(parsed));
  check("doc keeps all cards", parsed.doc.nodes.length === 7, String(parsed.doc.nodes.length));
  check("doc keeps all arrows", parsed.doc.edges.length === 6, String(parsed.doc.edges.length));
  check("doc keeps the frame", parsed.doc.groups.length === 1);
  check("cards have finite coordinates", parsed.doc.nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y)));
  check("mindmap root is near the center", Math.abs(parsed.doc.nodes.find((node) => node.text === "编译器").x) < 400);
  check(
    "mindmap puts branches on both sides",
    parsed.doc.nodes.find((node) => node.text === "前端").x > 0 &&
      parsed.doc.nodes.find((node) => node.text === "后端").x < 0,
  );
  check("viewport is a fit", parsed.doc.viewport.zoom > 0.2 && parsed.doc.viewport.zoom <= 1.2);
  check("mindmap cards do not overlap", overlappingPairs(parsed.doc.nodes).length === 0, overlappingPairs(parsed.doc.nodes).join(", "));
  check(
    "mindmap edges pick the nearest sides",
    parsed.doc.edges.some((edge) => edge.sourceHandle === "right" || edge.sourceHandle === "left"),
  );

  const read = call("canvas_read", { vault: "TestVault", canvas: "编译器概览" });
  check("canvas_read resolves by title", read.result?.isError !== true, contentOf(read));
  const readData = parseContent(read);
  const rootId = readData.doc?.nodes?.find((node) => node.text === "编译器")?.id;
  const frontId = readData.doc?.nodes?.find((node) => node.text === "前端")?.id;
  const optId = readData.doc?.nodes?.find((node) => node.text === "优化")?.id;
  const lexId = readData.doc?.nodes?.find((node) => node.text === "词法分析")?.id;
  const codegenId = readData.doc?.nodes?.find((node) => node.text === "代码生成")?.id;
  check("canvas_read returns ids", Boolean(rootId && frontId && optId && lexId && codegenId));

  const edited = call("canvas_edit", {
    vault: "TestVault",
    canvas: "canvases/编译器概览.json",
    addNodes: [{ key: "semantic", text: "语义分析" }],
    addEdges: [{ from: frontId, to: "semantic" }, { from: "semantic", to: optId }],
    updateNodes: [
      { id: lexId, text: "词法分析（Lexer）", notes: "字符流 → token 流" },
      { id: rootId, color: "#d08b2f" },
    ],
    removeNodeIds: [codegenId],
  });
  check("canvas_edit succeeds", edited.result?.isError !== true, contentOf(edited));
  const afterEdit = parseCanvas(fs.readFileSync(canvasPath, "utf8")).doc;
  check("edit added a card", afterEdit.nodes.some((node) => node.text === "语义分析"));
  check("edit updated text", afterEdit.nodes.some((node) => node.text === "词法分析（Lexer）"));
  check(
    "edit removed the card and its edge",
    !afterEdit.nodes.some((node) => node.id === codegenId) && afterEdit.edges.length === 7,
  );

  const laidOut = call("canvas_layout", {
    vault: "TestVault",
    canvas: "编译器概览",
    mode: "tree",
    direction: "TB",
  });
  check("canvas_layout succeeds", laidOut.result?.isError !== true, contentOf(laidOut));
  const afterLayout = parseCanvas(fs.readFileSync(canvasPath, "utf8")).doc;
  check("tree layout keeps finite positions", afterLayout.nodes.every((node) => Number.isFinite(node.y)));
  check("tree layout cards do not overlap", overlappingPairs(afterLayout.nodes).length === 0, overlappingPairs(afterLayout.nodes).join(", "));

  const listed = parseContent(call("canvas_list", { vault: "TestVault" }));
  check("canvas_list finds the new board", listed.canvases?.some((file) => file.title === "编译器概览"));

  const removedLayout = call("canvas_layout", { vault: "TestVault", canvas: "编译器概览", mode: "grid", columns: 3 });
  check("grid layout succeeds", removedLayout.result?.isError !== true, contentOf(removedLayout));

  const chain = {
    vault: "TestVault",
    title: "多层大纲",
    layout: { mode: "tree", direction: "TB" },
    nodes: [
      { key: "a", text: "总览", bold: true, fontSize: 20 },
      { key: "b1", text: "第一部分" },
      { key: "b2", text: "第二部分" },
      { key: "b3", text: "第三部分" },
      { key: "c1", text: "细节 A" },
      { key: "c2", text: "细节 B" },
      { key: "c3", text: "细节 C" },
      { key: "c4", text: "细节 D" },
      { key: "d1", text: "更长的一段备注文本，用来验证卡片自动高度和布局间距是否足够" },
      { key: "d2", text: "短" },
    ],
    edges: [
      { from: "a", to: "b1" },
      { from: "a", to: "b2" },
      { from: "a", to: "b3" },
      { from: "b1", to: "c1" },
      { from: "b1", to: "c2" },
      { from: "b2", to: "c3" },
      { from: "b2", to: "c4" },
      { from: "b3", to: "d1" },
      { from: "b3", to: "d2" },
    ],
    groups: [{ name: "第一部分", nodes: ["b1", "c1", "c2"] }],
  };
  const chained = call("canvas_create", chain);
  check("deep tree create succeeds", chained.result?.isError !== true, contentOf(chained));
  const chainData = parseContent(chained);
  const chainDoc = parseCanvas(fs.readFileSync(chainData.path, "utf8")).doc;
  check("deep tree cards do not overlap", overlappingPairs(chainDoc.nodes).length === 0, overlappingPairs(chainDoc.nodes).join(", "));
  const tallEnough = chainDoc.nodes.find((node) => node.text.startsWith("更长的一段"));
  check("long text gets a taller card", tallEnough.height > 44, String(tallEnough.height));
  const frame = chainDoc.groups[0];
  const idByText = new Map((chainData.nodes || []).map((node) => [node.text, node.id]));
  const framedIds = ["第一部分", "细节 A", "细节 B"].map((text) => idByText.get(text));
  const framed = chainDoc.nodes.filter((node) => framedIds.includes(node.id));
  check(
    "auto frame encloses its cards",
    Boolean(frame) && framed.length === 3 && framed.every((node) => node.x >= frame.x && node.y >= frame.y && node.x + node.width <= frame.x + frame.width && node.y + node.height <= frame.y + frame.height),
    JSON.stringify({ frame, framed: framed.map((node) => ({ x: node.x, y: node.y, width: node.width, height: node.height })) }),
  );

  const duplicateKey = call("canvas_create", {
    vault: "TestVault",
    title: "重复 key",
    nodes: [{ key: "x", text: "一" }, { key: "x", text: "二" }],
  });
  check("duplicate node keys are rejected", duplicateKey.result?.isError === true, JSON.stringify(duplicateKey));

  const noopEdit = call("canvas_edit", { vault: "TestVault", canvas: "编译器概览" });
  check("empty canvas_edit is rejected", noopEdit.result?.isError === true, JSON.stringify(noopEdit));

  const badRef = call("canvas_edit", {
    vault: "TestVault",
    canvas: "编译器概览",
    updateNodes: [{ id: "n_missing", text: "x" }],
  });
  check("unknown node id is rejected", badRef.result?.isError === true, JSON.stringify(badRef));

  const privateVault = JSON.parse(JSON.stringify([{ name: "Private", path: vault, private: true }]));
  process.env.PRISM_CANVAS_VAULTS = JSON.stringify(privateVault);
  const privateRead = call("canvas_list", { vault: "Private" });
  check("private vault is refused", privateRead.result?.isError === true, JSON.stringify(privateRead));
  process.env.PRISM_CANVAS_VAULTS = JSON.stringify([{ name: "TestVault", path: vault }]);

  const unknownTool = call("canvas_nope", {});
  check("unknown tool is an error result", unknownTool.result?.isError === true);
}

try {
  run();
} catch (error) {
  failures.push(`exception: ${error.stack ?? error.message}`);
  console.error(error);
} finally {
  fs.rmSync(vault, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll canvas MCP checks passed.");
