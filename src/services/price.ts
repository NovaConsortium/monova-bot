const COINGECKO_API = "https://api.coingecko.com/api/v3/simple/price?ids=monad&vs_currencies=usd";

let cachedPrice: number | null = null;
let lastFetch = 0;
const CACHE_TTL = 60_000; // 1 minute

export async function getMonPrice(): Promise<number | null> {
  const now = Date.now();
  if (cachedPrice !== null && now - lastFetch < CACHE_TTL) {
    return cachedPrice;
  }

  try {
    const res = await fetch(COINGECKO_API);
    const data = await res.json();
    if (data.monad?.usd) {
      cachedPrice = data.monad.usd;
      lastFetch = now;
      return cachedPrice;
    }
  } catch (error) {
    console.error("Failed to fetch MON price:", error);
  }

  return cachedPrice; // return stale if fresh fetch failed
}
