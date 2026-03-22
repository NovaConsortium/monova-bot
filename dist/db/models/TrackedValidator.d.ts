import mongoose, { Document } from "mongoose";
export type BatchMode = "instant" | "1min" | "5min" | "10min" | "30min";
export interface ITrackedValidator extends Document {
    guildId: string;
    channelId: string;
    nodeId: string;
    validatorName: string;
    commission: number;
    batchMode: BatchMode;
    addedBy: string;
    addedAt: Date;
}
export declare const TrackedValidator: mongoose.Model<ITrackedValidator, {}, {}, {}, mongoose.Document<unknown, {}, ITrackedValidator, {}, mongoose.DefaultSchemaOptions> & ITrackedValidator & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
} & {
    id: string;
}, any, ITrackedValidator>;
//# sourceMappingURL=TrackedValidator.d.ts.map