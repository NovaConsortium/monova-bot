import mongoose, { Schema, Document } from "mongoose";

export type BatchMode = "instant" | "1min" | "5min" | "10min" | "30min";

export interface ITrackedValidator extends Document {
  guildId: string;
  channelId: string;
  nodeId: string;
  validatorName: string;
  commission: number; // bps
  batchMode: BatchMode;
  addedBy: string;
  addedAt: Date;
}

const TrackedValidatorSchema = new Schema<ITrackedValidator>({
  guildId: { type: String, required: true },
  channelId: { type: String, required: true },
  nodeId: { type: String, required: true },
  validatorName: { type: String, default: "" },
  commission: { type: Number, default: 0 },
  batchMode: {
    type: String,
    enum: ["instant", "1min", "5min", "10min", "30min"],
    default: "instant",
  },
  addedBy: { type: String, required: true },
  addedAt: { type: Date, default: Date.now },
});

// One validator per channel — no duplicates
TrackedValidatorSchema.index({ channelId: 1, nodeId: 1 }, { unique: true });

export const TrackedValidator = mongoose.model<ITrackedValidator>(
  "TrackedValidator",
  TrackedValidatorSchema
);
