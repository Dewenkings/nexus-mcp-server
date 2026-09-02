import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as okx from "./okx.js";
import { loadMarketContext, type MarketDataClient } from "./market-context.js";

const KLINE_BARS = [
  "1m",
  "3m",
  "5m",
  "15m",
  "30m",
  "1H",
  "2H",
  "4H",
  "6H",
  "12H",
  "1D",
  "1W",
  "1M",
] as const;

// 每次调用创建新的 server 实例（无状态，stdio 与 HTTP 复用同一份注册逻辑）
export function createServer(
  dependencies: { marketClient?: MarketDataClient } = {},
): McpServer {
  const marketClient = dependencies.marketClient ?? okx;
  const server = new McpServer({
    name: "nexus-mcp-server",
    version: "0.1.0",
  });

  server.registerTool(
    "get_market_overview",
    {
      description:
        "获取 OKX 现货市场行情概览，按 24h 成交额降序返回前 N 个交易对，含最新价、24h 最高/最低、24h 涨跌幅与成交量。适合回答「现在行情怎么样」「哪些币在涨」之类的问题。",
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("返回的交易对数量，默认 20"),
        quote: z
          .string()
          .optional()
          .describe("按计价币种过滤，如 USDT（可选）"),
      },
    },
    async ({ limit, quote }) => {
      const n = limit ?? 20;
      const tickers = await okx.getTickers("SPOT");

      let list = tickers;
      if (quote) {
        list = list.filter((t) => t.instId.endsWith(`-${quote}`));
      }

      const rows = [...list]
        .sort((a, b) => Number(b.volCcy24h) - Number(a.volCcy24h))
        .slice(0, n)
        .map((t) => ({
          instId: t.instId,
          last: Number(t.last),
          open24h: Number(t.open24h),
          high24h: Number(t.high24h),
          low24h: Number(t.low24h),
          change24h: Number(okx.changePct(t.last, t.open24h).toFixed(2)),
          vol24h: Number(t.vol24h),
          volCcy24h: Number(t.volCcy24h),
        }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ count: rows.length, markets: rows }, null, 2),
          },
        ],
      };
    },
  );

  server.registerTool(
    "get_ticker",
    {
      description:
        "获取单个交易对的实时行情，含最新价、24h 最高/最低、24h 涨跌幅、买一/卖一价与成交量。instId 格式如 BTC-USDT、ETH-USDT。",
      inputSchema: {
        instId: z.string().describe("交易对，如 BTC-USDT"),
      },
    },
    async ({ instId }) => {
      const [ticker] = await okx.getTicker(instId);
      if (!ticker) {
        return {
          content: [{ type: "text", text: `未找到交易对 ${instId}` }],
        };
      }
      const data = {
        instId: ticker.instId,
        last: Number(ticker.last),
        open24h: Number(ticker.open24h),
        high24h: Number(ticker.high24h),
        low24h: Number(ticker.low24h),
        change24h: Number(okx.changePct(ticker.last, ticker.open24h).toFixed(2)),
        ask: Number(ticker.askPx),
        bid: Number(ticker.bidPx),
        vol24h: Number(ticker.vol24h),
        volCcy24h: Number(ticker.volCcy24h),
      };
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  server.registerTool(
    "get_kline",
    {
      description:
        "获取交易对的 K 线（蜡烛图）数据，返回按时间升序的 OHLCV 数组。bar 取值：1m/3m/5m/15m/30m/1H/2H/4H/6H/12H/1D/1W/1M。",
      inputSchema: {
        instId: z.string().describe("交易对，如 BTC-USDT"),
        bar: z.enum(KLINE_BARS).optional().describe("K 线周期，默认 1H"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(300)
          .optional()
          .describe("返回数量，默认 100"),
      },
    },
    async ({ instId, bar, limit }) => {
      const b = bar ?? "1H";
      const candles = await okx.getCandles(instId, b, limit ?? 100);
      // OKX 默认返回降序（最新在前），这里转为升序
      const rows = candles
        .map((c) => ({
          ts: Number(c[0]),
          open: Number(c[1]),
          high: Number(c[2]),
          low: Number(c[3]),
          close: Number(c[4]),
          vol: Number(c[5]),
          volCcy: Number(c[6]),
        }))
        .reverse();

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ instId, bar: b, candles: rows }, null, 2),
          },
        ],
      };
    },
  );

  server.registerTool(
    "get_orderbook",
    {
      description:
        "获取交易对的盘口深度（买卖盘挂单）。返回 asks（卖盘，价格从低到高）与 bids（买盘，价格从高到低），每档含价格与数量。",
      inputSchema: {
        instId: z.string().describe("交易对，如 BTC-USDT"),
        sz: z
          .number()
          .int()
          .min(1)
          .max(400)
          .optional()
          .describe("深度档位数，默认 20"),
      },
    },
    async ({ instId, sz }) => {
      const depth = sz ?? 20;
      const [book] = await okx.getOrderbook(instId, depth);
      if (!book) {
        return {
          content: [{ type: "text", text: `未找到 ${instId} 深度数据` }],
        };
      }
      const data = {
        instId,
        asks: book.asks.slice(0, depth).map((a) => ({
          price: Number(a[0]),
          size: Number(a[1]),
        })),
        bids: book.bids.slice(0, depth).map((b) => ({
          price: Number(b[0]),
          size: Number(b[1]),
        })),
      };
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  server.registerTool(
    "get_instruments",
    {
      description:
        "获取 OKX 支持的现货交易对列表，可按计价币种过滤。返回交易对 ID、基础币、计价币。",
      inputSchema: {
        quote: z.string().optional().describe("按计价币种过滤，如 USDT"),
      },
    },
    async ({ quote }) => {
      const instruments = await okx.getInstruments("SPOT");
      let list = instruments;
      if (quote) {
        list = list.filter((i) => i.quoteCcy === quote);
      }
      const rows = list
        .filter((i) => i.state === "live")
        .map((i) => ({ instId: i.instId, base: i.baseCcy, quote: i.quoteCcy }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { count: rows.length, instruments: rows },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  const aggregateInputSchema = {
    instrument: z.string().describe("USDT 现货交易对，如 BTC-USDT"),
    bar: z.enum(KLINE_BARS).optional().describe("K 线周期，默认 1H"),
    limit: z.number().int().min(20).max(100).optional().describe("K 线数量，默认 60"),
    depth: z.number().int().min(5).max(50).optional().describe("盘口深度，默认 20"),
  };

  server.registerTool(
    "get_market_context",
    {
      description: "一次获取指定 USDT 现货交易对的行情、K 线、盘口及确定性技术快照，适合 AI 市场解读。",
      inputSchema: aggregateInputSchema,
      annotations: { title: "Market Context", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (input) => {
      try {
        const context = await loadMarketContext(marketClient, input);
        return { content: [{ type: "text", text: JSON.stringify(context) }] };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: error instanceof Error ? error.message : "Market context unavailable" }],
        };
      }
    },
  );

  server.registerTool(
    "get_technical_snapshot",
    {
      description: "计算指定交易对的趋势、价格区间位置、已实现波动率、量比及盘口失衡；所有指标均由行情确定性计算。",
      inputSchema: aggregateInputSchema,
      annotations: { title: "Technical Snapshot", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (input) => {
      try {
        const context = await loadMarketContext(marketClient, input);
        return { content: [{ type: "text", text: JSON.stringify(context.technical) }] };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: error instanceof Error ? error.message : "Technical snapshot unavailable" }],
        };
      }
    },
  );

  return server;
}
