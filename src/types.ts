// OKX 现货行情（ticker / tickers 接口返回的 data 元素）
export interface OkxTicker {
  instType: string;
  instId: string;
  last: string;
  lastSz: string;
  askPx: string;
  askSz: string;
  bidPx: string;
  bidSz: string;
  open24h: string;
  high24h: string;
  low24h: string;
  volCcy24h: string;
  vol24h: string;
  ts: string;
  sodUtc0: string;
  sodUtc8: string;
}

// OKX K 线原始元组：[ts, open, high, low, close, vol, volCcy, volCcyQuote, confirm]
export type OkxCandleTuple = [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
];

// OKX 深度（books 接口返回的 data 元素）
// asks/bids 每项为 [price, size, liquidatedOrders, numOrders]
export interface OkxOrderbook {
  asks: [string, string, string, string][];
  bids: [string, string, string, string][];
  ts: string;
}

// OKX 交易对（instruments 接口返回的 data 元素）
export interface OkxInstrument {
  instType: string;
  instId: string;
  baseCcy: string;
  quoteCcy: string;
  state: string;
  [key: string]: unknown;
}
