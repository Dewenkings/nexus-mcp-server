import { calculateTechnicalSnapshot, type TechnicalSnapshot } from "./analysis.js";
import type { OkxCandleTuple, OkxOrderbook, OkxTicker } from "./types.js";

const BARS = new Set(["1m", "3m", "5m", "15m", "30m", "1H", "2H", "4H", "6H", "12H", "1D", "1W", "1M"]);

export interface MarketDataClient {
  getTicker(instrument: string): Promise<OkxTicker[]>;
  getCandles(instrument: string, bar: string, limit: number): Promise<OkxCandleTuple[]>;
  getOrderbook(instrument: string, depth: number): Promise<OkxOrderbook[]>;
}

export type MarketContext = {
  version: "1.0";
  source: "OKX";
  instrument: string;
  bar: string;
  asOf: string;
  dataQuality: "high" | "medium" | "low";
  warnings: string[];
  ticker: {
    last: number;
    open24h: number;
    high24h: number;
    low24h: number;
    change24hPct: number;
    volume24h: number;
  };
  candles: Array<{ ts: number; open: number; high: number; low: number; close: number; volume: number }>;
  orderBook: {
    asks: Array<{ price: number; size: number }>;
    bids: Array<{ price: number; size: number }>;
  };
  technical: TechnicalSnapshot;
};

export function normalizeSpotInstrument(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,12}-USDT$/.test(normalized)) {
    throw new Error("Unsupported instrument: expected a USDT spot pair");
  }
  return normalized;
}

function finite(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function loadMarketContext(
  client: MarketDataClient,
  input: { instrument: string; bar?: string; limit?: number; depth?: number },
): Promise<MarketContext> {
  const instrument = normalizeSpotInstrument(input.instrument);
  const bar = BARS.has(input.bar ?? "1H") ? (input.bar ?? "1H") : "1H";
  const limit = Math.min(100, Math.max(20, input.limit ?? 60));
  const depth = Math.min(50, Math.max(5, input.depth ?? 20));

  const [tickers, rawCandles, books] = await Promise.all([
    client.getTicker(instrument),
    client.getCandles(instrument, bar, limit),
    client.getOrderbook(instrument, depth),
  ]);
  const ticker = tickers[0];
  const book = books[0];
  if (!ticker || !book || rawCandles.length === 0) {
    throw new Error(`Market evidence unavailable for ${instrument}`);
  }

  const candles = rawCandles.map((candle) => ({
    ts: finite(candle[0]),
    open: finite(candle[1]),
    high: finite(candle[2]),
    low: finite(candle[3]),
    close: finite(candle[4]),
    volume: finite(candle[5]),
  })).reverse();
  const asks = book.asks.slice(0, depth).map((level) => ({ price: finite(level[0]), size: finite(level[1]) }));
  const bids = book.bids.slice(0, depth).map((level) => ({ price: finite(level[0]), size: finite(level[1]) }));
  const last = finite(ticker.last);
  const open24h = finite(ticker.open24h);
  const technical = calculateTechnicalSnapshot({
    instrument,
    ticker: { last, high24h: finite(ticker.high24h), low24h: finite(ticker.low24h), ts: finite(ticker.ts) },
    candles,
    asks,
    bids,
  });

  return {
    version: "1.0",
    source: "OKX",
    instrument,
    bar,
    asOf: technical.asOf,
    dataQuality: technical.dataQuality,
    warnings: technical.warnings,
    ticker: {
      last,
      open24h,
      high24h: finite(ticker.high24h),
      low24h: finite(ticker.low24h),
      change24hPct: open24h > 0 ? Number((((last - open24h) / open24h) * 100).toFixed(2)) : 0,
      volume24h: finite(ticker.vol24h),
    },
    candles,
    orderBook: { asks, bids },
    technical,
  };
}
