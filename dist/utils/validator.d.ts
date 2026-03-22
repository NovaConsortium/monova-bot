export interface ValidatorInfo {
    nodeId: string;
    name: string;
    logo: string;
    commission: number;
    stake: string;
    active: boolean;
}
export declare function formatNodeId(nodeId: string): string;
export declare function fetchAllValidators(): Promise<{
    name: string;
    nodeId: string;
    logo: string;
}[]>;
export declare function fetchValidatorInfo(nodeId: string): Promise<ValidatorInfo | null>;
//# sourceMappingURL=validator.d.ts.map