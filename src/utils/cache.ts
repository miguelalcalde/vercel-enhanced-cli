/**
 * Simple in-memory cache with TTL (Time To Live) support
 * Used to cache API responses and avoid redundant fetches
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

/** Default TTL: 5 minutes */
const DEFAULT_TTL = 300_000;

/**
 * Get a cached value if it exists and hasn't expired
 * @param key - Cache key
 * @returns Cached value or null if not found/expired
 */
export function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) {
    return null;
  }

  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }

  return entry.data as T;
}

/**
 * Store a value in the cache with a TTL
 * @param key - Cache key
 * @param data - Data to cache
 * @param ttlMs - Time to live in milliseconds (default: 5 minutes)
 */
export function setCache<T>(key: string, data: T, ttlMs = DEFAULT_TTL): void {
  cache.set(key, {
    data,
    expiresAt: Date.now() + ttlMs,
  });
}

/**
 * Invalidate (remove) a specific cache entry
 * @param key - Cache key to invalidate
 */
export function invalidateCache(key: string): void {
  cache.delete(key);
}

/**
 * Invalidate all cache entries that start with a given prefix
 * Useful for clearing all project-related cache entries
 * @param prefix - Key prefix to match
 */
export function invalidateCachePrefix(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}

/**
 * Clear all cache entries
 */
export function clearAllCache(): void {
  cache.clear();
}
