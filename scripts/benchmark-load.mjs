import { spawn } from "node:child_process";
import http from "node:http";

const PORT = 3105;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const agent = new http.Agent({ keepAlive: true, maxSockets: 64 });

function requestOnce(path, options = {}) {
  return new Promise((resolve) => {
    const start = performance.now();
    const req = http.request(
      `${BASE_URL}${path}`,
      {
        method: options.method || "GET",
        headers: options.headers || {},
        agent,
      },
      (res) => {
        res.resume();
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            latencyMs: performance.now() - start,
          });
        });
      }
    );
    req.on("error", () => {
      resolve({ status: 0, latencyMs: performance.now() - start });
    });
    if (options.body) req.write(options.body);
    req.end();
  });
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return Number(sorted[idx].toFixed(2));
}

async function runConcurrentLoad(label, totalRequests, concurrency, fn) {
  const latencies = [];
  let errors = 0;
  let completed = 0;
  const t0 = performance.now();

  async function worker() {
    while (true) {
      const idx = completed++;
      if (idx >= totalRequests) break;
      const res = await fn(idx);
      latencies.push(res.latencyMs);
      if (res.status >= 500 || res.status === 0) errors++;
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const elapsedSec = (performance.now() - t0) / 1000;
  latencies.sort((a, b) => a - b);

  const summary = {
    label,
    requests: totalRequests,
    concurrency,
    rps: Number((totalRequests / elapsedSec).toFixed(1)),
    p50Ms: percentile(latencies, 50),
    p95Ms: percentile(latencies, 95),
    p99Ms: percentile(latencies, 99),
    errorRatePct: Number(((errors / totalRequests) * 100).toFixed(2)),
  };
  console.log(JSON.stringify(summary));
  return summary;
}

async function main() {
  const proc = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)],
    {
      stdio: "pipe",
      env: {
        ...process.env,
        APP_URL: BASE_URL,
        NEXTAUTH_URL: BASE_URL,
        REDIS_URL: process.env.BENCH_REDIS_URL ?? "",
      },
    }
  );

  try {
    for (let i = 0; i < 40; i++) {
      const h = await requestOnce("/api/health");
      if (h.status === 200) break;
      await new Promise((r) => setTimeout(r, 250));
    }

    // Warmup
    await runConcurrentLoad("warmup-redirect", 20, 4, () =>
      requestOnce("/launch-26")
    );

    // Redirect benchmark (PostgreSQL direct path when Redis is offline)
    await runConcurrentLoad("redirect-302 (no-redis)", 300, 15, () =>
      requestOnce("/launch-26")
    );

    // Creation benchmark
    await runConcurrentLoad("create-url", 60, 6, (i) =>
      requestOnce("/api/urls", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          originalUrl: `https://example.com/bench-${Date.now()}-${i}`,
        }),
      })
    );
  } finally {
    agent.destroy();
    proc.kill();
    process.exit(0);
  }
}

main();
