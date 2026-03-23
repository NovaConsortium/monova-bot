"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startAPIServer = startAPIServer;
const http_1 = __importDefault(require("http"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const readline_1 = __importDefault(require("readline"));
const VALIDATOR_DIR = path_1.default.join(process.cwd(), "validatorData");
const API_PORT = parseInt(process.env.API_PORT || "3000", 10);
async function parseValidatorFile(filePath, secp) {
    const stream = fs_1.default.createReadStream(filePath, { encoding: "utf-8" });
    const rl = readline_1.default.createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of rl) {
        if (!line.trim())
            continue;
        try {
            const entry = JSON.parse(line);
            if (entry.nodeId === secp) {
                return entry;
            }
        }
        catch {
            // skip malformed lines
        }
    }
    return null;
}
async function getValidatorHistory(secp) {
    if (!fs_1.default.existsSync(VALIDATOR_DIR)) {
        return { validator: secp, totalSlots: 0, successful: 0, timeouts: 0, successRate: "0.00%", epochs: [] };
    }
    const files = fs_1.default.readdirSync(VALIDATOR_DIR).filter((f) => f.endsWith(".jsonl")).sort();
    const epochs = [];
    let totalSuccessful = 0;
    let totalTimeouts = 0;
    for (const file of files) {
        const entry = await parseValidatorFile(path_1.default.join(VALIDATOR_DIR, file), secp);
        if (!entry)
            continue;
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
function sendJSON(res, status, data) {
    res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify(data));
}
function startAPIServer() {
    const server = http_1.default.createServer(async (req, res) => {
        const url = new URL(req.url || "/", `http://localhost:${API_PORT}`);
        // GET /validator/:secp
        const match = url.pathname.match(/^\/validator\/([a-fA-F0-9]+)$/);
        if (req.method === "GET" && match) {
            const secp = match[1];
            if (secp.length < 10) {
                return sendJSON(res, 400, { error: "Invalid validator key — too short" });
            }
            try {
                const history = await getValidatorHistory(secp);
                return sendJSON(res, 200, history);
            }
            catch (err) {
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
//# sourceMappingURL=api-server.js.map