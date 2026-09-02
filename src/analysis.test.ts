import { describe, expect, it } from "vitest";

import { calculateTechnicalSnapshot } from "./analysis.js";

const candles = Array.from({ length: 21 }, (_, index) => ({
  ts: index,
  open: 100 + index,
  high: 102 + index,
  low: 99 + index,
  close: 101 + index,
  volume: index === 20 ? 300 : 100,
}));

describe("calculateTechnicalSnapshot", () => {
  it("derives bounded market metrics from complete evidence", () => {
    const snapshot = calculateTechnicalSnapshot({
      instrument: "BTC-USDT",
      ticker: { last: 120, high24h: 140, low24h: 100, ts: 1_700_000_000_000 },
      candles,
      asks: [{ price: 121, size: 1 }],
      bids: [{ price: 119, size: 2 }],
    });

    expect(snapshot.marketBias).toBe("bullish");
    expect(snapshot.priceRangePosition).toBe(50);
    expect(snapshot.volumeRatio).toBe(3);
    expect(snapshot.orderBookImbalance).toBeCloseTo(0.326, 3);
    expect(snapshot.realizedVolatilityPct).toBeGreaterThan(0);
    expect(snapshot.dataQuality).toBe("high");
    expect(snapshot.asOf).toBe("2023-11-14T22:13:20.000Z");
  });

  it("returns neutral finite metrics and a warning for insufficient evidence", () => {
    const snapshot = calculateTechnicalSnapshot({
      instrument: "ETH-USDT",
      ticker: { last: 0, high24h: 0, low24h: 0, ts: 0 },
      candles: [],
      asks: [],
      bids: [],
    });

    expect(snapshot.marketBias).toBe("neutral");
    expect(snapshot.priceRangePosition).toBe(0);
    expect(snapshot.realizedVolatilityPct).toBe(0);
    expect(snapshot.volumeRatio).toBe(0);
    expect(snapshot.orderBookImbalance).toBe(0);
    expect(snapshot.dataQuality).toBe("low");
    expect(snapshot.warnings).toContain("insufficient_candles");
    expect(Object.values(snapshot.metrics).every(Number.isFinite)).toBe(true);
  });
});
