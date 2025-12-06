const { createClient } = require('redis');

let redisClient = null;
let inMemoryCache = new Map();

// Cache mode configuration
const CACHE_MODE = process.env.CACHE_MODE || 'memory'; // 'memory' or 'redis'
const REDIS_URL = process.env.REDIS_URL;

/**
 * Initialize Redis client if in Redis mode
 */
async function initializeRedis() {
    if (CACHE_MODE !== 'redis') {
        console.log('📦 Cache Mode: IN-MEMORY (for testing)');
        return null;
    }

    if (!REDIS_URL) {
        console.warn('⚠️  CACHE_MODE=redis but REDIS_URL not configured, falling back to memory');
        return null;
    }

    try {
        redisClient = createClient({
            url: REDIS_URL,
            socket: {
                reconnectStrategy: (retries) => Math.min(retries * 50, 500)
            }
        });

        redisClient.on('error', (err) => {
            console.error('❌ Redis Client Error:', err);
        });

        redisClient.on('connect', () => {
            console.log('🔗 Redis Client Connected');
        });

        redisClient.on('ready', () => {
            console.log('✅ Redis Client Ready - Cache Mode: REDIS');
        });

        await redisClient.connect();
        return redisClient;
    } catch (error) {
        console.error('❌ Redis initialization failed:', error);
        console.log('⚠️  Falling back to in-memory cache');
        return null;
    }
}

/**
 * Get cached data
 */
async function getCachedData(key) {
    try {
        if (CACHE_MODE === 'redis' && redisClient && redisClient.isOpen) {
            const cached = await redisClient.get(key);
            if (cached) {
                console.log(`🚀 Redis Cache HIT: ${key}`);
                return JSON.parse(cached);
            }
            console.log(`📭 Redis Cache MISS: ${key}`);
            return null;
        }

        // In-memory cache
        const cached = inMemoryCache.get(key);
        if (cached && cached.expiresAt > Date.now()) {
            console.log(`🚀 Memory Cache HIT: ${key}`);
            return cached.data;
        }

        if (cached) {
            inMemoryCache.delete(key); // Remove expired
        }
        console.log(`📭 Memory Cache MISS: ${key}`);
        return null;
    } catch (error) {
        console.error('❌ Cache GET error:', error);
        return null;
    }
}

/**
 * Set cached data with TTL
 */
async function setCachedData(key, data, ttlSeconds = 300) {
    try {
        if (CACHE_MODE === 'redis' && redisClient && redisClient.isOpen) {
            await redisClient.setEx(key, ttlSeconds, JSON.stringify(data));
            console.log(`💾 Redis Cached: ${key} (TTL: ${ttlSeconds}s)`);
            return true;
        }

        // In-memory cache
        inMemoryCache.set(key, {
            data,
            expiresAt: Date.now() + (ttlSeconds * 1000)
        });
        console.log(`💾 Memory Cached: ${key} (TTL: ${ttlSeconds}s)`);
        return true;
    } catch (error) {
        console.error('❌ Cache SET error:', error);
        return false;
    }
}

/**
 * Clear cache (useful for testing)
 */
async function clearCache(pattern = null) {
    try {
        if (CACHE_MODE === 'redis' && redisClient && redisClient.isOpen) {
            if (pattern) {
                const keys = await redisClient.keys(pattern);
                if (keys.length > 0) {
                    await redisClient.del(keys);
                    console.log(`🗑️  Cleared ${keys.length} Redis keys matching: ${pattern}`);
                }
            } else {
                await redisClient.flushAll();
                console.log('🗑️  Cleared all Redis cache');
            }
            return true;
        }

        // In-memory cache
        if (pattern) {
            const regex = new RegExp(pattern.replace('*', '.*'));
            for (const key of inMemoryCache.keys()) {
                if (regex.test(key)) {
                    inMemoryCache.delete(key);
                }
            }
            console.log(`🗑️  Cleared memory cache matching: ${pattern}`);
        } else {
            inMemoryCache.clear();
            console.log('🗑️  Cleared all memory cache');
        }
        return true;
    } catch (error) {
        console.error('❌ Cache CLEAR error:', error);
        return false;
    }
}

/**
 * Generate cache key for products
 */
function generateProductsCacheKey(collection, limit, after, locations) {
    const parts = ['products', collection || 'all', `limit:${limit}`];
    if (after) parts.push(`after:${after}`);
    if (locations && locations.length > 0) parts.push(`loc:${locations.sort().join(',')}`);
    return parts.join(':');
}

module.exports = {
    initializeRedis,
    getCachedData,
    setCachedData,
    clearCache,
    generateProductsCacheKey
};
