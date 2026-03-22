interface UploadResult {
    success: boolean;
    url?: string | undefined;
    error?: string | undefined;
}
/**
 * Uploads a file to a GitHub repository using the Contents API.
 * Requires GITHUB_SLOTS_TOKEN and GITHUB_SLOTS_REPO env vars.
 */
export declare function uploadToGitHub(filePath: string, folder?: string): Promise<UploadResult>;
export {};
//# sourceMappingURL=github-upload.d.ts.map