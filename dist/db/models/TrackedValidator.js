"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrackedValidator = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const TrackedValidatorSchema = new mongoose_1.Schema({
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
exports.TrackedValidator = mongoose_1.default.model("TrackedValidator", TrackedValidatorSchema);
//# sourceMappingURL=TrackedValidator.js.map