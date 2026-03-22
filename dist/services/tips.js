"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBlockTips = getBlockTips;
const MONAD_RPC = process.env.MONAD_RPC_URL || "https://rpc.monad.xyz";
async function getBlockTips(blockNum) {
    const hexBlock = "0x" + blockNum.toString(16);
    try {
        const [blockRes, receiptsRes] = await Promise.all([
            fetch(MONAD_RPC, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    method: "eth_getBlockByNumber",
                    params: [hexBlock, false],
                    id: 1,
                    jsonrpc: "2.0",
                }),
            }),
            fetch(MONAD_RPC, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    method: "eth_getBlockReceipts",
                    params: [hexBlock],
                    id: 2,
                    jsonrpc: "2.0",
                }),
            }),
        ]);
        const blockData = await blockRes.json();
        const receiptsData = await receiptsRes.json();
        const block = blockData.result;
        const receipts = receiptsData.result;
        if (!block || !receipts)
            return null;
        const baseFee = BigInt(block.baseFeePerGas || "0x0");
        let totalTips = BigInt(0);
        for (const r of receipts) {
            const effectiveGasPrice = BigInt(r.effectiveGasPrice || "0x0");
            const gasUsed = BigInt(r.gasUsed || "0x0");
            const tipPerGas = effectiveGasPrice - baseFee;
            if (tipPerGas > 0n) {
                totalTips += tipPerGas * gasUsed;
            }
        }
        // Convert wei to MON (18 decimals)
        const totalTipsMon = Number(totalTips) / 1e18;
        return {
            totalTipsMon,
            txCount: receipts.length,
        };
    }
    catch (error) {
        console.error(`Failed to fetch tips for block ${blockNum}:`, error);
        return null;
    }
}
//# sourceMappingURL=tips.js.map