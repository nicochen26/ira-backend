/**
 * Simple in-memory cache with TTL support
 * In production, this would be replaced with Redis or similar
 */
class MemoryCache {
  constructor() {
    this.cache = new Map();
    this.timers = new Map();
  }

  /**
   * Set a cache entry with optional TTL
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttlMs - Time to live in milliseconds (default: 5 minutes)
   */
  set(key, value, ttlMs = 5 * 60 * 1000) {
    // Clear existing timer if any
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
    }

    // Set the value
    this.cache.set(key, {
      value: value,
      createdAt: Date.now(),
      ttl: ttlMs
    });

    // Set TTL timer
    if (ttlMs > 0) {
      const timer = setTimeout(() => {
        this.delete(key);
      }, ttlMs);

      this.timers.set(key, timer);
    }
  }

  /**
   * Get a cache entry
   * @param {string} key - Cache key
   * @returns {any|null} Cached value or null if not found/expired
   */
  get(key) {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (entry.ttl > 0 && (Date.now() - entry.createdAt) > entry.ttl) {
      this.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
   * Check if cache has a key
   * @param {string} key - Cache key
   * @returns {boolean} True if key exists and not expired
   */
  has(key) {
    return this.get(key) !== null;
  }

  /**
   * Delete a cache entry
   * @param {string} key - Cache key
   */
  delete(key) {
    // Clear timer if any
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
      this.timers.delete(key);
    }

    // Remove from cache
    this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear() {
    // Clear all timers
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }

    this.timers.clear();
    this.cache.clear();
  }

  /**
   * Get cache size
   * @returns {number} Number of cached entries
   */
  size() {
    return this.cache.size;
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getStats() {
    const entries = Array.from(this.cache.entries());
    const now = Date.now();

    const stats = {
      totalEntries: entries.length,
      activeEntries: 0,
      expiredEntries: 0,
      memoryUsage: 0
    };

    entries.forEach(([key, entry]) => {
      if (entry.ttl > 0 && (now - entry.createdAt) > entry.ttl) {
        stats.expiredEntries++;
      } else {
        stats.activeEntries++;
      }

      // Rough estimate of memory usage
      stats.memoryUsage += key.length + JSON.stringify(entry.value).length;
    });

    return stats;
  }
}

// Create a singleton cache instance
const searchCache = new MemoryCache();

/**
 * Generate cache key for search results
 * @param {string} query - Search query
 * @param {Object} filters - Search filters
 * @param {Object} metadata - Search metadata
 * @param {number} limit - Result limit
 * @param {number} offset - Result offset
 * @returns {string} Cache key
 */
function generateSearchCacheKey(query, filters = {}, metadata = {}, limit = 20, offset = 0) {
  const keyData = {
    query: query.trim().toLowerCase(),
    filters,
    metadata,
    limit,
    offset
  };

  // Create a simple hash-like key
  const keyString = JSON.stringify(keyData);
  return `search:${Buffer.from(keyString).toString('base64').slice(0, 40)}`;
}

/**
 * Cache search results with smart TTL based on query complexity
 * @param {string} cacheKey - Cache key
 * @param {Object} results - Search results to cache
 * @param {string} query - Original search query (for TTL calculation)
 */
function cacheSearchResults(cacheKey, results, query) {
  // Adjust TTL based on query characteristics
  let ttl = 5 * 60 * 1000; // 5 minutes default

  // Longer TTL for simple queries
  if (query.split(' ').length <= 2) {
    ttl = 15 * 60 * 1000; // 15 minutes
  }

  // Shorter TTL for complex queries or recent content
  if (query.includes('recent') || query.includes('today') || query.includes('latest')) {
    ttl = 2 * 60 * 1000; // 2 minutes
  }

  searchCache.set(cacheKey, results, ttl);
}

module.exports = {
  MemoryCache,
  searchCache,
  generateSearchCacheKey,
  cacheSearchResults
};