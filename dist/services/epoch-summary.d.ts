import { Client } from "discord.js";
export declare function updateEpochUserMap(tracked: Map<string, Array<{
    addedBy: string;
}>>): void;
export declare function recordBlock(epoch: string, nodeId: string, blockNum: number, validatorName: string, validatorLogo: string, commission: number): void;
export declare function recordSkip(epoch: string, nodeId: string, validatorName: string, validatorLogo: string, commission: number): void;
export declare function writeValidatorLog(epoch: string): Promise<void>;
export declare function sendEpochSummaries(client: Client, epoch: string): Promise<void>;
//# sourceMappingURL=epoch-summary.d.ts.map