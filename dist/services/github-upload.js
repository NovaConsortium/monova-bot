"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadToGitHub = uploadToGitHub;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const GITHUB_API = "https://api.github.com";
/**
 * Uploads a file to a GitHub repository using the Contents API.
 * Requires GITHUB_SLOTS_TOKEN and GITHUB_SLOTS_REPO env vars.
 */
async function uploadToGitHub(filePath, folder = "slotsData") {
    const token = process.env.GITHUB_SLOTS_TOKEN;
    const repo = process.env.GITHUB_SLOTS_REPO; // e.g. "owner/repo"
    const branch = process.env.GITHUB_SLOTS_BRANCH || "main";
    if (!token || !repo) {
        return { success: false, error: "GITHUB_SLOTS_TOKEN or GITHUB_SLOTS_REPO not configured" };
    }
    const fileName = path_1.default.basename(filePath);
    const epochMatch = fileName.match(/(?:slots|validators)-(\d+)\.jsonl/);
    const RANGE_SIZE = 50;
    let rangeFolder = "unknown";
    if (epochMatch) {
        const epoch = parseInt(epochMatch[1], 10);
        const rangeStart = Math.floor(epoch / RANGE_SIZE) * RANGE_SIZE + 1;
        const rangeEnd = rangeStart + RANGE_SIZE - 1;
        rangeFolder = `${rangeStart}-${rangeEnd}`;
    }
    const repoPath = `${folder}/${rangeFolder}/${fileName}`;
    const url = `${GITHUB_API}/repos/${repo}/contents/${repoPath}`;
    try {
        const content = fs_1.default.readFileSync(filePath);
        const base64Content = content.toString("base64");
        // Check if file already exists (to get its SHA for updating)
        let sha;
        const getRes = await fetch(url, {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/vnd.github.v3+json",
            },
        });
        if (getRes.ok) {
            const existing = (await getRes.json());
            sha = existing.sha;
        }
        const body = {
            message: `Update ${fileName}`,
            content: base64Content,
            branch,
        };
        if (sha) {
            body.sha = sha;
        }
        const putRes = await fetch(url, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/vnd.github.v3+json",
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        });
        if (!putRes.ok) {
            const err = await putRes.text();
            return { success: false, error: `GitHub API ${putRes.status}: ${err}` };
        }
        const result = (await putRes.json());
        console.log(`✅ Uploaded ${fileName} to ${repo}`);
        return { success: true, url: result.content?.html_url ?? undefined };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { success: false, error: message };
    }
}
//# sourceMappingURL=github-upload.js.map