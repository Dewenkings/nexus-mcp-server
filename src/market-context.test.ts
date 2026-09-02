import { describe, expect, it } from "vitest";

import { loadMarketContext, normalizeSpotInstrument } from "./market-context.js";
import type { MarketDataClient } from "./market-context.js";
import type { OkxCandleTuple } from "./types.js";

const client: MarketDataClient = {
  getTicker: async () => [{
    instType: "SPOT", instId: "BTC-USDT", last: "120", lastSz: "1",
    askPx: "121", askSz: "2", bidPx: "119", bidSz: "3", open24h: "100",
    high24h: "140", low24h: "80", volCcy24h: "1000", vol24h: "10",
    ts: "1700000000000", sodUtc0: "", sodUtc8: "",
  }],
  getCandles: async () => Array.from({ length: 21 }, (_, index) => ([
    String(1_700_000_000_000 + index), String(100 + index), String(102 + index),
    String(99 + index), String(101 + index), index === 20 ? "300" : "100", "0", "0", "1",
  ] satisfies OkxCandleTuple)).reverse(),
  getOrderbook: async () => [{
    asks: [["121", "1", "0", "1"]], bids: [["119", "2", "0", "1"]], ts: "1700000000020",
  }],
};

describe("normalizeSpotInstrument", () => {
  it("normalizes supported USDT spot pairs and rejects unsafe identifiers", () => {
    expect(normalizeSpotInstrument(" btc-usdt ")).toBe("BTC-USDT");
    expect(() => normalizeSpotInstrument("BTC-USDT&foo=bar")).toThrow("Unsupported instrument");
    expect(() => normalizeSpotInstrument("BTC-USD")).toThrow("Unsupported instrument");
  });
});

describe("loadMarketContext", () => {
  it("returns one versioned evidence envelope and technical snapshot", async () => {
    const result = await loadMarketContext(client, { instrument: "btc-usdt", bar: "1H", limit: 21, depth: 20 });

    expect(result.version).toBe("1.0");
    expect(result.source).toBe("OKX");
    expect(result.instrument).toBe("BTC-USDT");
    expect(result.ticker.last).toBe(120);
    expect(result.candles).toHaveLength(21);
    expect(result.orderBook.bids[0]).toEqual({ price: 119, size: 2 });
    expect(result.technical.marketBias).toBe("bullish");
    expect(result.dataQuality).toBe("high");
    expect(result.warnings).toEqual([]);
  });

  it("maps missing upstream evidence to a domain error", async () => {
    const emptyClient: MarketDataClient = {
      getTicker: async () => [],
      getCandles: async () => [],
      getOrderbook: async () => [],
    };

    await expect(loadMarketContext(emptyClient, { instrument: "ETH-USDT" }))
      .rejects.toThrow("Market evidence unavailable");
  });
});
