#!/usr/bin/env -S node --loader tsx/esm
/**
 * Smoke test for Phase A (OSM-derived structured fields) + Phase C
 * (bulk endpoints). Boots the same data root as the MCP server, then
 * exercises searchArea / getSpots / get_entity_full / get_entities_bulk
 * / plan_feasibility_check on a few canonical landmarks.
 */
// Importing the server module triggers data init via `await initDataRoot()`
// in module top-level — but search_area etc. are not exported. Use the
// MCP client transport instead. Simpler approach: spin up the server in
// the same process with stdio simulated via Node Streams.

import { initDataRoot } from "../src/index.js";

// Re-import the internal handlers via dynamic import so we can call the
// tool functions directly. The server module wires them onto a Server
// instance but also exposes initDataRoot for HTTP entry-point reuse.
// For testing, we use the MCP SDK's in-process client.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

await initDataRoot();
const { buildServer } = await import("../src/index.js");
const server = buildServer() as Server;

// In-process tool call: synthesize the request object and invoke the handler.
async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const handlers = (server as unknown as {
    _requestHandlers: Map<string, (req: unknown) => Promise<unknown>>;
  })._requestHandlers;
  const handler = handlers.get("tools/call");
  if (!handler) throw new Error("no tools/call handler registered");
  const req = {
    method: "tools/call",
    params: { name, arguments: args },
  };
  return handler(req);
}
void ListToolsRequestSchema;
void CallToolRequestSchema;

function pretty(obj: unknown, max = 60): string {
  const s = JSON.stringify(obj, null, 2);
  if (s.length > max * 50) return s.slice(0, max * 50) + " ...[truncated]";
  return s;
}

console.log("=== Phase C smoke test ===\n");

console.log("--- get_entity_full Q188754 (Himeji Castle) ---");
const r1 = await callTool("get_entity_full", { qid: "Q188754", lang: "en" });
console.log(pretty(r1, 80));

console.log("\n--- get_entities_bulk [Q188754, Q5798, Q1148755] (Himeji, Fuji, Izumo Taisha) ---");
const r2 = await callTool("get_entities_bulk", {
  qids: ["Q188754", "Q5798", "Q1148755"],
  lang: "en",
});
console.log(pretty(r2, 80));

console.log("\n--- plan_feasibility_check Tokyo→Kyoto→Himeji (transit) ---");
const r3 = await callTool("plan_feasibility_check", {
  itinerary: [
    { qid: "Q1490", minutes: 240 },         // Tokyo (city)
    { qid: "Q34600", minutes: 480 },        // Kyoto (city)
    { qid: "Q188754", minutes: 120 },       // Himeji Castle
  ],
  travel_mode: "transit",
});
console.log(pretty(r3, 60));

console.log("\n=== Phase B intent + Phase A search_area smoke ===\n");
console.log("--- search_area '高野山の宿坊' ---");
const r4 = await callTool("search_area", { q: "高野山の宿坊" });
const r4obj = r4 as { content?: { text: string }[] };
const r4txt = r4obj.content?.[0]?.text ?? JSON.stringify(r4);
const r4parsed = JSON.parse(r4txt);
console.log("query_intent:", JSON.stringify(r4parsed.query_intent ?? null, null, 2));
console.log("routing_hint:", JSON.stringify(r4parsed.routing_hint ?? null, null, 2));
console.log("tier_counts:", JSON.stringify(r4parsed.tier_counts ?? null));
console.log("first 3 results (name/tier/kinds):");
for (const x of (r4parsed.results ?? []).slice(0, 3)) {
  console.log(`  ${x.tier?.padEnd(8)} ${x.type?.padEnd(12)} ${x.name_ja ?? x.name ?? "?"} kinds=${JSON.stringify(x.kinds ?? null)} oh=${x.opening_hours ?? "-"}`);
}

console.log("\n--- search_area '擬洋風建築' ---");
const r5 = await callTool("search_area", { q: "擬洋風建築" });
const r5parsed = JSON.parse(((r5 as { content?: { text: string }[] }).content?.[0]?.text) ?? "{}");
console.log("query_intent.detected_concepts:", JSON.stringify(r5parsed.query_intent?.detected_concepts ?? [], null, 2));
console.log("first 5 results:");
for (const x of (r5parsed.results ?? []).slice(0, 5)) {
  console.log(`  ${x.tier?.padEnd(8)} ${x.name_ja ?? x.name ?? "?"} heritage=${JSON.stringify(x.heritage_designations_labels ?? null)}`);
}

console.log("\nDone.");
