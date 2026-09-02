import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import { createServer } from "./server.js";
import type { MarketDataClient } from "./market-context.js";
import type { OkxCandleTuple } from "./types.js";

const marketClient: MarketDataClient = {
  getTicker: async () => [{
    instType: "SPOT", instId: "BTC-USDT", last: "120", lastSz: "1", askPx: "121", askSz: "2",
    bidPx: "119", bidSz: "3", open24h: "100", high24h: "140", low24h: "80",
    volCcy24h: "1000", vol24h: "10", ts: "1700000000000", sodUtc0: "", sodUtc8: "",
  }],
  getCandles: async () => Array.from({ length: 21 }, (_, index) => ([
    String(1_700_000_000_000 + index), String(100 + index), String(102 + index), String(99 + index),
    String(101 + index), index === 20 ? "300" : "100", "0", "0", "1",
  ] satisfies OkxCandleTuple)).reverse(),
  getOrderbook: async () => [{ asks: [["121", "1", "0", "1"]], bids: [["119", "2", "0", "1"]], ts: "1700000000020" }],
};

const closeables: Array<{ close(): Promise<void> }> = [];
afterEach(async () => {
  await Promise.all(closeables.splice(0).map((item) => item.close()));
});

async function connectedClient() {
  const server = createServer({ marketClient });
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  closeables.push(client, server);
  return client;
}

describe("Nexus aggregate tools", () => {
  it("advertises read-only aggregate market tools", async () => {
    const client = await connectedClient();
    const result = await client.listTools();
    const contextTool = result.tools.find((tool) => tool.name === "get_market_context");
    const technicalTool = result.tools.find((tool) => tool.name === "get_technical_snapshot");

    expect(contextTool?.annotations?.readOnlyHint).toBe(true);
    expect(technicalTool?.annotations?.readOnlyHint).toBe(true);
  });

  it("returns structured market context without network access", async () => {
    const client = await connectedClient();
    const result = await client.callTool({ name: "get_market_context", arguments: { instrument: "btc-usdt", bar: "1H" } });
    const content = result.content as Array<{ type: string; text?: string }>;
    const text = content.find((part) => part.type === "text");
    if (!text || text.type !== "text") throw new Error("missing tool content");
    const payload = JSON.parse(text.text ?? "") as { version: string; instrument: string; technical: { marketBias: string } };

    expect(payload.version).toBe("1.0");
    expect(payload.instrument).toBe("BTC-USDT");
    expect(payload.technical.marketBias).toBe("bullish");
  });

  it("returns a tool error for unsupported instruments", async () => {
    const client = await connectedClient();
    const result = await client.callTool({ name: "get_market_context", arguments: { instrument: "BTC-USD" } });

    expect(result.isError).toBe(true);
  });
});
