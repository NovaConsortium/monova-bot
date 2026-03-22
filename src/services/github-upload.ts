import fs from "fs";
import path from "path";

const GITHUB_API = "https://api.github.com";

interface UploadResult {
  success: boolean;
  url?: string | undefined;
  error?: string | undefined;
}

/**
 * Uploads a file to a GitHub repository using the Contents API.
 * Requires GITHUB_SLOTS_TOKEN and GITHUB_SLOTS_REPO env vars.
 */
export async function uploadToGitHub(filePath: string, folder: string = "slotsData"): Promise<UploadResult> {
  const token = process.env.GITHUB_SLOTS_TOKEN;
  const repo = process.env.GITHUB_SLOTS_REPO; // e.g. "owner/repo"
  const branch = process.env.GITHUB_SLOTS_BRANCH || "main";

  if (!token || !repo) {
    return { success: false, error: "GITHUB_SLOTS_TOKEN or GITHUB_SLOTS_REPO not configured" };
  }

  const fileName = path.basename(filePath);
  const epochMatch = fileName.match(/(?:slots|validators)-(\d+)\.jsonl/);
  const RANGE_SIZE = 50;
  let rangeFolder = "unknown";
  if (epochMatch) {
    const epoch = parseInt(epochMatch[1]!, 10);
    const rangeStart = Math.floor(epoch / RANGE_SIZE) * RANGE_SIZE + 1;
    const rangeEnd = rangeStart + RANGE_SIZE - 1;
    rangeFolder = `${rangeStart}-${rangeEnd}`;
  }
  const repoPath = `${folder}/${rangeFolder}/${fileName}`;
  const url = `${GITHUB_API}/repos/${repo}/contents/${repoPath}`;

  try {
    const content = fs.readFileSync(filePath);
    const base64Content = content.toString("base64");

    // Check if file already exists (to get its SHA for updating)
    let sha: string | undefined;
    const getRes = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (getRes.ok) {
      const existing = (await getRes.json()) as { sha: string };
      sha = existing.sha;
    }

    const body: Record<string, string> = {
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

    const result = (await putRes.json()) as { content?: { html_url?: string } };
    console.log(`✅ Uploaded ${fileName} to ${repo}`);
    return { success: true, url: result.content?.html_url ?? undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
