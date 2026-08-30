import type {
  OkxTicker,
  OkxCandleTuple,
  OkxOrderbook,
  OkxInstrument,
} from "./types.js";

const BASE_URL = "https://www.okx.com";

export class OkxError extends Error {}

// 统一 GET 请求 + OKX 错误码校验
async function okxGet<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    throw new OkxError(`OKX 请求失败: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!res.ok) {
    throw new OkxError(`OKX HTTP ${res.status}`);
  }
  const json = (await res.json()) as { code: string; msg: string; data: T };
  if (json.code !== "0") {
    throw new OkxError(`OKX API ${json.code}: ${json.msg}`);
  }
  return json.data;
}

// 单个交易对行情
export function getTicker(instId: string): Promise<OkxTicker[]> {
  return okxGet<OkxTicker[]>(`/api/v5/market/ticker?instId=${encodeURIComponent(instId)}`);
}

// 全部现货行情
export function getTickers(instType = "SPOT"): Promise<OkxTicker[]> {
  return okxGet<OkxTicker[]>(`/api/v5/market/tickers?instType=${instType}`);
}

// K 线
export function getCandles(
  instId: string,
  bar: string,
  limit: number,
): Promise<OkxCandleTuple[]> {
  return okxGet<OkxCandleTuple[]>(
    `/api/v5/market/candles?instId=${encodeURIComponent(instId)}&bar=${bar}&limit=${limit}`,
  );
}

// 盘口深度
export function getOrderbook(instId: string, sz: number): Promise<OkxOrderbook[]> {
  return okxGet<OkxOrderbook[]>(
    `/api/v5/market/books?instId=${encodeURIComponent(instId)}&sz=${sz}`,
  );
}

// 交易对列表
export function getInstruments(instType = "SPOT"): Promise<OkxInstrument[]> {
  return okxGet<OkxInstrument[]>(`/api/v5/public/instruments?instType=${instType}`);
}

// 24h 涨跌幅（百分比，OKX 未直接提供，需自算）
export function changePct(last: string, open24h: string): number {
  const l = Number(last);
  const o = Number(open24h);
  if (!Number.isFinite(l) || !Number.isFinite(o) || o === 0) return 0;
  return ((l - o) / o) * 100;
}
