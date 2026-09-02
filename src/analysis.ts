export type MarketBias = "bullish" | "bearish" | "neutral";
export type DataQuality = "high" | "medium" | "low";

export type AnalysisCandle = {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type AnalysisBookLevel = { price: number; size: number };

export type TechnicalSnapshot = {
  version: "1.0";
  source: "OKX";
  instrument: string;
  asOf: string;
  marketBias: MarketBias;
  priceRangePosition: number;
  realizedVolatilityPct: number;
  volumeRatio: number;
  orderBookImbalance: number;
  dataQuality: DataQuality;
  warnings: string[];
  metrics: {
    priceRangePosition: number;
    realizedVolatilityPct: number;
    volumeRatio: number;
    orderBookImbalance: number;
  };
};

type TechnicalSnapshotInput = {
  instrument: string;
  ticker: { last: number; high24h: number; low24h: number; ts: number };
  candles: AnalysisCandle[];
  asks: AnalysisBookLevel[];
  bids: AnalysisBookLevel[];
};

const round = (value: number, digits = 4): number => {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
};

const average = (values: number[]): number => {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const calculateBias = (candles: AnalysisCandle[]): MarketBias => {
  if (candles.length < 20) return "neutral";
  const closes = candles.map((candle) => candle.close).filter(Number.isFinite);
  if (closes.length < 20) return "neutral";
  const fast = average(closes.slice(-5));
  const slow = average(closes.slice(-20));
  if (!slow) return "neutral";
  const spread = (fast - slow) / slow;
  if (spread > 0.002) return "bullish";
  if (spread < -0.002) return "bearish";
  return "neutral";
};

export function calculateTechnicalSnapshot(
  input: TechnicalSnapshotInput,
): TechnicalSnapshot {
  const warnings: string[] = [];
  if (input.candles.length < 20) warnings.push("insufficient_candles");
  if (!input.asks.length || !input.bids.length) warnings.push("insufficient_orderbook");

  const range = input.ticker.high24h - input.ticker.low24h;
  const priceRangePosition = range > 0
    ? Math.min(100, Math.max(0, ((input.ticker.last - input.ticker.low24h) / range) * 100))
    : 0;

  const returns = input.candles.slice(1).map((candle, index) => {
    const previous = input.candles[index]?.close ?? 0;
    return previous > 0 && candle.close > 0 ? Math.log(candle.close / previous) : 0;
  }).filter(Number.isFinite);
  const meanReturn = average(returns);
  const variance = returns.length
    ? average(returns.map((value) => (value - meanReturn) ** 2))
    : 0;
  const realizedVolatilityPct = Math.sqrt(variance) * Math.sqrt(Math.max(returns.length, 1)) * 100;

  const latestVolume = input.candles.at(-1)?.volume ?? 0;
  const baselineVolumes = input.candles.slice(-21, -1).map((candle) => candle.volume).filter((value) => value > 0);
  const baselineVolume = average(baselineVolumes);
  const volumeRatio = baselineVolume > 0 ? latestVolume / baselineVolume : 0;

  const bidNotional = input.bids.reduce((sum, level) => sum + level.price * level.size, 0);
  const askNotional = input.asks.reduce((sum, level) => sum + level.price * level.size, 0);
  const totalNotional = bidNotional + askNotional;
  const orderBookImbalance = totalNotional > 0
    ? (bidNotional - askNotional) / totalNotional
    : 0;

  const metrics = {
    priceRangePosition: round(priceRangePosition, 2),
    realizedVolatilityPct: round(realizedVolatilityPct, 4),
    volumeRatio: round(volumeRatio, 2),
    orderBookImbalance: round(orderBookImbalance, 4),
  };

  const dataQuality: DataQuality = warnings.length === 0
    ? "high"
    : input.candles.length >= 5 && (input.asks.length > 0 || input.bids.length > 0)
      ? "medium"
      : "low";

  return {
    version: "1.0",
    source: "OKX",
    instrument: input.instrument,
    asOf: new Date(input.ticker.ts || 0).toISOString(),
    marketBias: calculateBias(input.candles),
    ...metrics,
    dataQuality,
    warnings,
    metrics,
  };
}
