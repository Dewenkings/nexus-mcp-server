import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer as createHttpServer, type IncomingMessage } from "node:http";
import { createServer } from "./server.js";

const TRANSPORT = (process.env.TRANSPORT ?? "stdio").toLowerCase();
const PORT = Number(process.env.PORT ?? 3001);

async function runStdio(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("nexus-mcp-server (stdio) started");
}

async function runHttp(): Promise<void> {
  const httpServer = createHttpServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/mcp") {
      try {
        const body = await readBody(req);
        const server = createServer();
        // stateless 模式：每次请求新建 server + transport，不维护 session
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        });
        await server.connect(transport);
        await transport.handleRequest(req, res, body);
        res.on("close", () => {
          transport.close();
          server.close();
        });
      } catch (e) {
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              error: { code: -32603, message: "Internal error" },
              id: null,
            }),
          );
        }
      }
    } else if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } else {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Method not allowed" }));
    }
  });

  httpServer.listen(PORT, () => {
    console.error(
      `nexus-mcp-server (Streamable HTTP) listening on http://localhost:${PORT}/mcp`,
    );
  });
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}

if (TRANSPORT === "http") {
  runHttp();
} else {
  runStdio();
}
