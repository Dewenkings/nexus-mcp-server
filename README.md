# nexus-mcp-server

一个基于 [Model Context Protocol (MCP)](https://modelcontextprotocol.io) 的 TypeScript 服务器，把 OKX 公开市场数据（行情、K 线、盘口、交易对）暴露为 AI Agent 可调用的工具。

- 数据源：OKX 公开 REST API（免费、无需 API Key）
- 传输：同时支持 **stdio**（本地接入 Claude Desktop / Cursor）与 **Streamable HTTP**（部署成远程服务）
- 无状态设计：每次请求新建 server 实例，无 session 状态

## 工具列表

| 工具 | 说明 |
|---|---|
| `get_market_overview` | 市场行情概览，按 24h 成交额排序返回前 N 个交易对 |
| `get_ticker` | 单个交易对实时行情（最新价、24h 涨跌、买卖一价） |
| `get_kline` | K 线（OHLCV），支持 1m ~ 1M 周期 |
| `get_orderbook` | 盘口深度（asks / bids） |
| `get_instruments` | 支持的现货交易对列表 |
| `get_market_context` | 一次聚合 ticker、K 线、盘口与确定性技术指标，供 Agent 编排使用 |
| `get_technical_snapshot` | 返回趋势、波动率、量能、区间位置与盘口失衡等可解释指标 |

## 快速开始

```bash
npm install
```

### 方式一：stdio（本地接入 Claude Desktop / Cursor）

```bash
npm run dev
```

在 Claude Desktop 的 `claude_desktop_config.json` 中注册：

```json
{
  "mcpServers": {
    "nexus": {
      "command": "npx",
      "args": ["tsx", "/绝对路径/nexus-mcp-server/src/index.ts"]
    }
  }
}
```

### 方式二：Streamable HTTP（远程服务）

```bash
npm run dev:http
# 监听 http://localhost:3001/mcp，健康检查 http://localhost:3001/health
```

生产环境使用编译产物：

```bash
npm run build
npm run start:http
```

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `TRANSPORT` | `stdio` | `stdio` 或 `http` |
| `PORT` | `3001` | HTTP 模式监听端口 |
| `MCP_AUTH_TOKEN` | 空 | 可选 Bearer Token；远程部署时必须配置 |

## 网络代理

OKX 在部分地区无法直连。`npm run dev` / `dev:http` 已通过 `NODE_USE_ENV_PROXY=1` 让 Node 的 `fetch` 自动读取 `http_proxy` / `https_proxy` 环境变量走代理（如 Clash 的 `127.0.0.1:7890`）。

- 若无代理且能直连 OKX，可去掉脚本里的 `NODE_USE_ENV_PROXY=1`。
- 无代理环境变量时，该变量为 no-op，直连请求，不影响运行。

## 本地测试（Client）

项目内置一个 client，用于本地验证 server 的工具是否正常（无需接入 Claude Desktop / Cursor）。

**stdio 模式（自动 spawn server）**：

```bash
npm run client
```

**HTTP 模式（需先启动 server）**：

```bash
# 终端 1：启动 server
npm run dev:http

# 终端 2：运行 client
npm run client:http
```

client 会列出所有工具，并调用 `get_ticker` 与 `get_market_overview` 打印真实行情数据。

## 示例

问 Agent：「现在 BTC 和 ETH 谁涨得多？」

Agent 会调用 `get_market_overview`，得到按成交额排序的行情概览，包含每个交易对的 `change24h` 涨跌幅。Apex Ledger 的交易 Copilot 则只调用聚合工具 `get_market_context`，避免模型自行拼装多个工具结果。

## 目录结构

```
src/
├── index.ts           # 入口，按 TRANSPORT 切换 stdio / HTTP
├── server.ts          # MCP server 创建 + 工具注册
├── market-context.ts  # 聚合上下文与版本化工具契约
├── analysis.ts        # 确定性技术指标计算（不依赖 LLM）
├── http-security.ts   # 远程 MCP Bearer 鉴权
├── client.ts          # 本地测试客户端
├── okx.ts             # OKX API 客户端封装
└── types.ts           # OKX 返回类型定义
```

## Agent 安全边界

- 当前仓库只暴露公开行情读取工具，没有真实交易、转账或 API 私钥能力。
- 指标由 TypeScript 确定性计算，LLM 只负责解释，原始来源、时间和数据质量随响应返回。
- 远程环境使用 `MCP_AUTH_TOKEN`；H5 服务端以同值 `NEXUS_MCP_TOKEN` 调用，Token 不进入浏览器。
- 工具输入经过 Zod 校验，只接受规范化的 `*-USDT` 现货交易对与受控 K 线周期。
