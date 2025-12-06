const shopifyService = require('../services/shopify.service');
const { StatusCodes } = require('http-status-codes');
const config = require('../config/serverConfig');

/**
 * Products Controller
 * 
 * Handles product catalog queries for kiosk/mobile
 * Uses caching layer to avoid Shopify API rate limits
 */

/**
 * Get products (with optional collection filter)
 * GET /api/products?collection=popup&limit=50&after=cursor
 */
exports.getProducts = async (req, res, next) => {
    try {
        const {
            collection = null,
            limit = 50,
            after = null
        } = req.query;

        // Validate collection against whitelist (if configured)
        const whitelist = config.SHOPIFY.COLLECTIONS_WHITELIST;
        if (whitelist.length > 0 && collection) {
            if (!whitelist.includes(collection)) {
                return res.status(StatusCodes.FORBIDDEN).json({
                    error: 'Collection not allowed',
                    message: `Only the following collections are allowed: ${whitelist.join(', ')}`,
                    allowedCollections: whitelist
                });
            }
        }

        const result = await shopifyService.fetchProducts({
            collection,
            limit: parseInt(limit),
            after
        });

        res.status(StatusCodes.OK).json({
            products: result.products,
            pageInfo: result.pageInfo
        });

    } catch (error) {
        next(error);
    }
};

/**
 * Get single product by ID
 * GET /api/products/:productId
 */
exports.getProduct = async (req, res, next) => {
    try {
        const { productId } = req.params;

        // Ensure GID format
        const gid = productId.startsWith('gid://') 
            ? productId 
            : `gid://shopify/Product/${productId}`;

        const product = await shopifyService.fetchProduct(gid);

        if (!product) {
            return res.status(StatusCodes.NOT_FOUND).json({
                error: 'Product not found'
            });
        }

        res.status(StatusCodes.OK).json({ product });

    } catch (error) {
        next(error);
    }
};
