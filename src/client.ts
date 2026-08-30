import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const TRANSPORT = (process.env.TRANSPORT ?? "stdio").toLowerCase();

async function main(): Promise<void> {
  let transport: StdioClientTransport | StreamableHTTPClientTransport;

  if (TRANSPORT === "http") {
    // 连已运行的 Streamable HTTP server（先 `npm run dev:http`）
    transport = new StreamableHTTPClientTransport(
      new URL("http://localhost:3001/mcp"),
    );
  } else {
    // spawn server 子进程（stdio 方式，用 tsx 跑 src/index.ts）
    // 注意：SDK 默认只继承白名单环境变量，需显式传完整 env，
    // 否则子进程拿不到 https_proxy / NODE_USE_ENV_PROXY，导致无法走代理访问 OKX。
    transport = new StdioClientTransport({
      command: process.execPath,
      args: ["--import", "tsx", "src/index.ts"],
      env: { ...process.env } as Record<string, string>,
    });
  }

  const client = new Client({ name: "nexus-mcp-client", version: "0.1.0" });
  await client.connect(transport);

  // 1. 列出所有工具
  const tools = await client.listTools();
  console.log("=== 可用工具 ===");
  for (const t of tools.tools) {
    console.log(`- ${t.name}: ${t.description}`);
  }

  // 2. 调用 get_ticker
  const ticker = await client.callTool({
    name: "get_ticker",
    arguments: { instId: "BTC-USDT" },
  });
  console.log("\n=== get_ticker(BTC-USDT) ===");
  console.log(textOf(ticker));

  // 3. 调用 get_market_overview（前 3 个 USDT 交易对）
  const overview = await client.callTool({
    name: "get_market_overview",
    arguments: { limit: 3, quote: "USDT" },
  });
  console.log("\n=== get_market_overview(limit=3, quote=USDT) ===");
  console.log(textOf(overview));

  await client.close();
}

function textOf(r: any): string {
  for (const c of r.content) {
    if (c.type === "text") return c.text ?? "";
  }
  return "";
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
