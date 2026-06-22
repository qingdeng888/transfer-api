import http from "node:http";
import process from "node:process";

// 环境变量映射为 env 对象（兼容 Worker 的 env 接口）
const env = () => ({
  UPSTREAM_BASE_URL: process.env.UPSTREAM_BASE_URL,
  DEFAULT_MODEL: process.env.DEFAULT_MODEL,
  DEFAULT_CLAUDE_MODEL: process.env.DEFAULT_CLAUDE_MODEL,
  UNLIMITED_SURF_API_KEY: process.env.UNLIMITED_SURF_API_KEY,
  WORKER_API_KEY: process.env.WORKER_API_KEY,
});

const PORT = process.env.PORT || 8787;

// 动态导入 worker 模块，获取 default 导出
let workerModule = null;
async function getHandler() {
  if (!workerModule) {
    const mod = await import("./worker.js");
    workerModule = mod.default;
  }
  return workerModule;
}

// 将 Node.js IncomingMessage body 转为 ReadableStream
function convertBody(req) {
  return new ReadableStream({
    start(controller) {
      req.on("data", (chunk) => controller.enqueue(chunk));
      req.on("end", () => controller.close());
      req.on("error", (err) => controller.error(err));
    },
  });
}

// 从 Node.js headers 构造 Web Headers
function extractHeaders(req) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else if (value !== undefined) {
      headers.set(key, value);
    }
  }
  return headers;
}

// 构建完整 URL
function buildUrl(req) {
  const protocol = req.headers["x-forwarded-proto"] || (req.socket.encrypted ? "https" : "http");
  const host = req.headers.host || `localhost:${PORT}`;
  return `${protocol}://${host}${req.url}`;
}

// 创建 HTTP 服务器
const server = http.createServer(async (req, res) => {
  try {
    const url = buildUrl(req);
    const body = req.method !== "GET" && req.method !== "HEAD" ? convertBody(req) : null;

    const request = new Request(url, {
      method: req.method,
      headers: extractHeaders(req),
      body,
      duplex: "half",
    });

    const handler = await getHandler();
    const response = await handler.fetch(request, env());

    // 写入状态码
    res.writeHead(response.status || 200, Object.fromEntries(response.headers.entries()));

    // 流式写入 body
    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
    }
    res.end();
  } catch (error) {
    console.error("Server error:", error);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal Server Error", message: error.message }));
    } else {
      res.end();
    }
  }
});

server.listen(PORT, () => {
  console.log(`Transfer-API server listening on http://localhost:${PORT}`);
});
