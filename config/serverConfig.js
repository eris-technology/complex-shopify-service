module.exports = {
    PORT: process.env.PORT || 3000,
    NODE_ENV: process.env.NODE_ENV || 'development',
    SHOPIFY: {
        SHOP_DOMAIN: process.env.SHOPIFY_SHOP_DOMAIN,
        ACCESS_TOKEN: process.env.SHOPIFY_ACCESS_TOKEN,
        API_VERSION: process.env.SHOPIFY_API_VERSION || '2024-01',
        // Comma-separated list of allowed collection handles. Empty = all collections allowed
        COLLECTIONS_WHITELIST: process.env.SHOPIFY_COLLECTIONS_WHITELIST 
            ? process.env.SHOPIFY_COLLECTIONS_WHITELIST.split(',').map(c => c.trim()).filter(Boolean)
            : []
    },
    WISHLIST: {
        EXPIRATION_HOURS: parseInt(process.env.WISHLIST_EXPIRATION_HOURS || '24', 10),
        MAX_ITEMS: parseInt(process.env.MAX_ITEMS_PER_WISHLIST || '50', 10)
    },
    USER_SERVICE_URL: process.env.USER_SERVICE_URL || 'http://localhost:3001'
};
