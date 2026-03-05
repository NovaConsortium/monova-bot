const GMONADS_METADATA_API = "https://www.gmonads.com/api/v1/public/validators/metadata?network=mainnet";
const GMONADS_EPOCH_API = "https://www.gmonads.com/api/v1/public/validators/epoch?network=mainnet";

interface ValidatorMeta {
  secp: string;
  name?: string;
  logo?: string;
}

interface ValidatorEpoch {
  node_id: string;
  commission: number;
  stake: string;
  validator_set_type: string;
}

export interface ValidatorInfo {
  nodeId: string;
  name: string;
  logo: string;
  commission: number; // bps
  stake: string;
  active: boolean;
}

export function formatNodeId(nodeId: string): string {
  if (!nodeId || nodeId.length < 8) return nodeId;
  return `${nodeId.slice(0, 6)}...${nodeId.slice(-4)}`;
}

let cachedValidators: { name: string; nodeId: string; logo: string }[] = [];
let cacheTimestamp = 0;
const CACHE_TTL = 60_000; // 1 minute

export async function fetchAllValidators(): Promise<{ name: string; nodeId: string; logo: string }[]> {
  if (Date.now() - cacheTimestamp < CACHE_TTL && cachedValidators.length > 0) {
    return cachedValidators;
  }

  try {
    const [metaRes, epochRes] = await Promise.all([
      fetch(GMONADS_METADATA_API),
      fetch(GMONADS_EPOCH_API),
    ]);

    const metaData = await metaRes.json();
    const epochData = await epochRes.json();

    const metaMap = new Map<string, { name: string; logo: string }>();
    for (const v of metaData.data ?? []) {
      metaMap.set(v.secp, { name: v.name || "", logo: v.logo || "" });
    }

    cachedValidators = (epochData.data ?? []).map((v: ValidatorEpoch) => ({
      nodeId: v.node_id,
      name: metaMap.get(v.node_id)?.name || "",
      logo: metaMap.get(v.node_id)?.logo || "",
    }));
    cacheTimestamp = Date.now();

    return cachedValidators;
  } catch (error) {
    console.error("Failed to fetch validators list:", error);
    return cachedValidators; // return stale cache on error
  }
}

export async function fetchValidatorInfo(nodeId: string): Promise<ValidatorInfo | null> {
  try {
    // Fetch metadata and epoch data in parallel
    const [metaRes, epochRes] = await Promise.all([
      fetch(GMONADS_METADATA_API),
      fetch(GMONADS_EPOCH_API),
    ]);

    const metaData = await metaRes.json();
    const epochData = await epochRes.json();

    const meta = metaData.data?.find((v: ValidatorMeta) => v.secp === nodeId);
    const epoch = epochData.data?.find((v: ValidatorEpoch) => v.node_id === nodeId);

    if (!epoch) return null;

    return {
      nodeId,
      name: meta?.name || "",
      logo: meta?.logo || "",
      commission: epoch.commission ?? 0,
      stake: epoch.stake ?? "0",
      active: epoch.validator_set_type === "active",
    };
  } catch (error) {
    console.error("Failed to fetch validator info:", error);
    return null;
  }
}
