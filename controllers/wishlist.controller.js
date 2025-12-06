const { Wishlist, WishlistItem, Idempotency } = require('../models');
const { StatusCodes } = require('http-status-codes');
const crypto = require('crypto');

/**
 * Wishlist Controller
 * 
 * Handles general wishlist operations
 */

/**
 * Create a new wishlist
 * POST /api/wishlists
 */
exports.createWishlist = async (req, res, next) => {
    try {
        const { user_id, items, source = 'KIOSK', metadata } = req.body;

        // Validation
        if (!user_id) {
            return res.status(StatusCodes.BAD_REQUEST).json({
                error: 'user_id is required'
            });
        }

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(StatusCodes.BAD_REQUEST).json({
                error: 'items array is required and must not be empty'
            });
        }

        // Check idempotency key if provided
        const idempotencyKey = req.headers['idempotency-key'];
        if (idempotencyKey) {
            const existing = await Idempotency.findOne({
                where: { idempotency_key: idempotencyKey }
            });

            if (existing) {
                if (existing.status === 'COMPLETED') {
                    // Return cached response
                    return res.status(StatusCodes.OK).json(existing.response_data);
                } else if (existing.status === 'PROCESSING') {
                    return res.status(StatusCodes.CONFLICT).json({
                        error: 'Request is already being processed'
                    });
                }
            }
        }

        // Create idempotency record if key provided
        let idempotencyRecord = null;
        if (idempotencyKey) {
            idempotencyRecord = await Idempotency.create({
                idempotency_key: idempotencyKey,
                operation_type: 'CREATE_WISHLIST',
                request_payload: req.body,
                status: 'PROCESSING'
            });
        }

        // Calculate expiration time
        const expirationHours = parseInt(process.env.WISHLIST_EXPIRATION_HOURS || '24', 10);
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + expirationHours);

        // Generate QR code token
        const qrCodeToken = crypto.randomBytes(32).toString('hex');

        // Create wishlist
        const wishlist = await Wishlist.create({
            user_id,
            status: 'ACTIVE',
            source,
            qr_code_token: qrCodeToken,
            expires_at: expiresAt,
            metadata: metadata || {}
        });

        // Create wishlist items
        const wishlistItems = await Promise.all(
            items.map(item => WishlistItem.create({
                wishlist_id: wishlist.wishlist_id,
                shopify_variant_id: item.variant_id || item.variantId,
                shopify_product_id: item.product_id || item.productId,
                quantity: item.quantity || 1,
                product_title: item.product_title || item.title || 'Unknown Product',
                variant_title: item.variant_title || item.variantTitle,
                price: item.price,
                currency: item.currency || 'HKD',
                barcode: item.barcode,
                image_url: item.image_url || item.imageUrl,
                product_data: item.product_data || item
            }))
        );

        // Fetch complete wishlist with items
        const completeWishlist = await Wishlist.findByPk(wishlist.wishlist_id, {
            include: [{
                model: WishlistItem,
                as: 'items'
            }]
        });

        const response = {
            wishlist: completeWishlist,
            qr_code_token: qrCodeToken
        };

        // Update idempotency record if exists
        if (idempotencyRecord) {
            await idempotencyRecord.update({
                wishlist_id: wishlist.wishlist_id,
                response_data: response,
                status: 'COMPLETED'
            });
        }

        res.status(StatusCodes.CREATED).json(response);

    } catch (error) {
        next(error);
    }
};

/**
 * Get wishlist by ID
 * GET /api/wishlists/:wishlistId
 */
exports.getWishlist = async (req, res, next) => {
    try {
        const { wishlistId } = req.params;

        const wishlist = await Wishlist.findByPk(wishlistId, {
            include: [{
                model: WishlistItem,
                as: 'items'
            }]
        });

        if (!wishlist) {
            return res.status(StatusCodes.NOT_FOUND).json({
                error: 'Wishlist not found'
            });
        }

        res.status(StatusCodes.OK).json({ wishlist });

    } catch (error) {
        next(error);
    }
};

/**
 * Search wishlists with filters
 * GET /api/wishlists?user_id=xxx&status=ACTIVE
 */
exports.searchWishlists = async (req, res, next) => {
    try {
        const { user_id, status, source, limit = 50, offset = 0 } = req.query;

        const where = {};
        if (user_id) where.user_id = user_id;
        if (status) where.status = status;
        if (source) where.source = source;

        const { count, rows } = await Wishlist.findAndCountAll({
            where,
            include: [{
                model: WishlistItem,
                as: 'items'
            }],
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [['created_at', 'DESC']]
        });

        res.status(StatusCodes.OK).json({
            wishlists: rows,
            total: count,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

    } catch (error) {
        next(error);
    }
};

/**
 * Update wishlist items
 * PUT /api/wishlists/:wishlistId/items
 */
exports.updateWishlistItems = async (req, res, next) => {
    try {
        const { wishlistId } = req.params;
        const { items } = req.body;

        const wishlist = await Wishlist.findByPk(wishlistId);

        if (!wishlist) {
            return res.status(StatusCodes.NOT_FOUND).json({
                error: 'Wishlist not found'
            });
        }

        if (wishlist.status !== 'ACTIVE') {
            return res.status(StatusCodes.BAD_REQUEST).json({
                error: `Cannot update wishlist with status: ${wishlist.status}`
            });
        }

        // Delete existing items
        await WishlistItem.destroy({ where: { wishlist_id: wishlistId } });

        // Create new items
        await Promise.all(
            items.map(item => WishlistItem.create({
                wishlist_id: wishlistId,
                shopify_variant_id: item.variant_id || item.variantId,
                shopify_product_id: item.product_id || item.productId,
                quantity: item.quantity || 1,
                product_title: item.product_title || item.title,
                variant_title: item.variant_title || item.variantTitle,
                price: item.price,
                currency: item.currency || 'HKD',
                barcode: item.barcode,
                image_url: item.image_url || item.imageUrl,
                product_data: item.product_data || item
            }))
        );

        // Fetch updated wishlist
        const updatedWishlist = await Wishlist.findByPk(wishlistId, {
            include: [{
                model: WishlistItem,
                as: 'items'
            }]
        });

        res.status(StatusCodes.OK).json({ wishlist: updatedWishlist });

    } catch (error) {
        next(error);
    }
};

/**
 * Cancel/delete wishlist
 * DELETE /api/wishlists/:wishlistId
 */
exports.cancelWishlist = async (req, res, next) => {
    try {
        const { wishlistId } = req.params;

        const wishlist = await Wishlist.findByPk(wishlistId);

        if (!wishlist) {
            return res.status(StatusCodes.NOT_FOUND).json({
                error: 'Wishlist not found'
            });
        }

        await wishlist.update({ status: 'CANCELLED' });

        res.status(StatusCodes.OK).json({
            message: 'Wishlist cancelled successfully',
            wishlist
        });

    } catch (error) {
        next(error);
    }
};

/**
 * Manually expire wishlist
 * POST /api/wishlists/:wishlistId/expire
 */
exports.expireWishlist = async (req, res, next) => {
    try {
        const { wishlistId } = req.params;

        const wishlist = await Wishlist.findByPk(wishlistId);

        if (!wishlist) {
            return res.status(StatusCodes.NOT_FOUND).json({
                error: 'Wishlist not found'
            });
        }

        await wishlist.update({ status: 'EXPIRED' });

        res.status(StatusCodes.OK).json({
            message: 'Wishlist expired successfully',
            wishlist
        });

    } catch (error) {
        next(error);
    }
};
