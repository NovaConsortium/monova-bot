import { Client } from "discord.js";
export interface SlotEvent {
    nodeId: string;
    validatorName: string;
    validatorLogo: string;
    commission: number;
    blockNum: number;
    round: string;
    epoch: string;
    timestamp: number;
}
export interface SkipEvent {
    nodeId: string;
    validatorName: string;
    validatorLogo: string;
    round: string;
    epoch: string;
    timestamp: number;
}
export declare function sendSkipAlert(client: Client, userId: string, event: SkipEvent): Promise<void>;
export declare function handleSlotEvent(client: Client, channelId: string, batchMode: string, event: SlotEvent): void;
//# sourceMappingURL=notification.d.ts.map