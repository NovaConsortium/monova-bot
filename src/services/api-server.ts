import http from "http";
import fs from "fs";
import path from "path";
import readline from "readline";

const VALIDATOR_DIR = path.join(process.cwd(), "validatorData");
const API_PORT = parseInt(process.env.API_PORT || "3000", 10);

interface ValidatorLogEntry {
  epoch: string;
  nodeId: string;
  validatorName: string;
  commission: number;
  totalSlots: number;
  successful: number;
  timeouts: number;
  successRate: string;
  blocks: number[];
  timestamp: number;
}

interface ValidatorHistory {
  validator: string;
  totalSlots: number;
  successful: number;
  timeouts: number;
  successRate: string;
  epochs: ValidatorLogEntry[];
}

async function parseValidatorFile(filePath: string, secp: string): Promise<ValidatorLogEntry | null> {
  const stream = fs.createReadStream(filePath, { encoding: "utf-8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const entry: ValidatorLogEntry = JSON.parse(line);
      if (entry.nodeId === secp) {
        return entry;
      }
    } catch {
      // skip malformed lines
    }
  }

  return null;
}

async function getValidatorHistory(secp: string): Promise<ValidatorHistory> {
  if (!fs.existsSync(VALIDATOR_DIR)) {
    return { validator: secp, totalSlots: 0, successful: 0, timeouts: 0, successRate: "0.00%", epochs: [] };
  }

  const files = fs.readdirSync(VALIDATOR_DIR).filter((f) => f.endsWith(".jsonl")).sort();
  const epochs: ValidatorLogEntry[] = [];
  let totalSuccessful = 0;
  let totalTimeouts = 0;

  for (const file of files) {
    const entry = await parseValidatorFile(path.join(VALIDATOR_DIR, file), secp);
    if (!entry) continue;

    epochs.push(entry);
    totalSuccessful += entry.successful;
    totalTimeouts += entry.timeouts;
  }

  const total = totalSuccessful + totalTimeouts;
  const rate = total > 0 ? ((totalSuccessful / total) * 100).toFixed(2) : "0.00";

  return {
    validator: secp,
    totalSlots: total,
    successful: totalSuccessful,
    timeouts: totalTimeouts,
    successRate: `${rate}%`,
    epochs,
  };
}

function sendJSON(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(data));
}

export function startAPIServer(): void {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://localhost:${API_PORT}`);

    // GET /validator/:secp
    const match = url.pathname.match(/^\/validator\/([a-fA-F0-9]+)$/);
    if (req.method === "GET" && match) {
      const secp = match[1]!;
      if (secp.length < 10) {
        return sendJSON(res, 400, { error: "Invalid validator key — too short" });
      }
      try {
        const history = await getValidatorHistory(secp);
        return sendJSON(res, 200, history);
      } catch (err) {
        console.error("API error:", err);
        return sendJSON(res, 500, { error: "Internal server error" });
      }
    }

    // GET /health
    if (req.method === "GET" && url.pathname === "/health") {
      return sendJSON(res, 200, { status: "ok" });
    }

    sendJSON(res, 404, { error: "Not found" });
  });

  server.listen(API_PORT, () => {
    console.log(`🌐 API server running on port ${API_PORT}`);
  });
}
