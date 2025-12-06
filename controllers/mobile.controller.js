const { Wishlist, WishlistItem } = require('../models');
const { StatusCodes } = require('http-status-codes');
const crypto = require('crypto');

/**
 * Mobile App Controller
 * 
 * Handles mobile app specific operations
 * Authentication handled by BFF - user_id passed from authenticated BFF requests
 */

/**
 * Create wishlist from mobile app
 * POST /api/mobile/wishlists
 */
exports.createWishlist = async (req, res, next) => {
    try {
        // User ID passed from BFF after authentication
        const { user_id } = req.body;

        if (!user_id) {
            return res.status(StatusCodes.BAD_REQUEST).json({
                error: 'user_id is required'
            });
        }

        const { items, metadata } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(StatusCodes.BAD_REQUEST).json({
                error: 'items array is required and must not be empty'
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
            source: 'MOBILE_APP',
            qr_code_token: qrCodeToken,
            expires_at: expiresAt,
            metadata: metadata || {}
        });

        // Create wishlist items
        await Promise.all(
            items.map(item => WishlistItem.create({
                wishlist_id: wishlist.wishlist_id,
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

        // Fetch complete wishlist with items
        const completeWishlist = await Wishlist.findByPk(wishlist.wishlist_id, {
            include: [{
                model: WishlistItem,
                as: 'items'
            }]
        });

        res.status(StatusCodes.CREATED).json({
            wishlist: completeWishlist
        });

    } catch (error) {
        next(error);
    }
};

/**
 * Get my wishlists
 * GET /api/mobile/wishlists
 */
exports.getMyWishlists = async (req, res, next) => {
    try {
        // User ID passed from BFF after authentication
        const { user_id } = req.query;

        if (!user_id) {
            return res.status(StatusCodes.BAD_REQUEST).json({
                error: 'user_id query parameter is required'
            });
        }

        const { status, limit = 50, offset = 0 } = req.query;

        const where = { user_id };
        if (status) where.status = status;

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
 * Get specific wishlist
 * GET /api/mobile/wishlists/:wishlistId
 */
exports.getWishlist = async (req, res, next) => {
    try {
        const { wishlistId } = req.params;
        // User ID passed from BFF after authentication
        const { user_id } = req.query;

        if (!user_id) {
            return res.status(StatusCodes.BAD_REQUEST).json({
                error: 'user_id query parameter is required'
            });
        }

        const wishlist = await Wishlist.findOne({
            where: {
                wishlist_id: wishlistId,
                user_id // Ensure user owns this wishlist
            },
            include: [{
                model: WishlistItem,
                as: 'items'
            }]
        });

        if (!wishlist) {
            return res.status(StatusCodes.NOT_FOUND).json({
                error: 'Wishlist not found or access denied'
            });
        }

        res.status(StatusCodes.OK).json({ wishlist });

    } catch (error) {
        next(error);
    }
};

/**
 * Update wishlist
 * PUT /api/mobile/wishlists/:wishlistId
 */
exports.updateWishlist = async (req, res, next) => {
    try {
        const { wishlistId } = req.params;
        const { items, metadata, user_id } = req.body;

        if (!user_id) {
            return res.status(StatusCodes.BAD_REQUEST).json({
                error: 'user_id is required'
            });
        }

        const wishlist = await Wishlist.findOne({
            where: {
                wishlist_id: wishlistId,
                user_id // Ensure user owns this wishlist
            }
        });

        if (!wishlist) {
            return res.status(StatusCodes.NOT_FOUND).json({
                error: 'Wishlist not found or access denied'
            });
        }

        if (wishlist.status !== 'ACTIVE') {
            return res.status(StatusCodes.BAD_REQUEST).json({
                error: `Cannot update wishlist with status: ${wishlist.status}`
            });
        }

        // Update metadata if provided
        if (metadata) {
            await wishlist.update({ metadata });
        }

        // Update items if provided
        if (items && Array.isArray(items)) {
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
        }

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
 * Delete wishlist
 * DELETE /api/mobile/wishlists/:wishlistId
 */
exports.deleteWishlist = async (req, res, next) => {
    try {
        const { wishlistId } = req.params;
        // User ID passed from BFF after authentication
        const { user_id } = req.query;

        if (!user_id) {
            return res.status(StatusCodes.BAD_REQUEST).json({
                error: 'user_id query parameter is required'
            });
        }

        const wishlist = await Wishlist.findOne({
            where: {
                wishlist_id: wishlistId,
                user_id // Ensure user owns this wishlist
            }
        });

        if (!wishlist) {
            return res.status(StatusCodes.NOT_FOUND).json({
                error: 'Wishlist not found or access denied'
            });
        }

        await wishlist.update({ status: 'CANCELLED' });

        res.status(StatusCodes.OK).json({
            message: 'Wishlist deleted successfully'
        });

    } catch (error) {
        next(error);
    }
};

/**
 * Generate QR code for wishlist
 * POST /api/mobile/wishlists/:wishlistId/qr
 */
exports.generateQRCode = async (req, res, next) => {
    try {
        const { wishlistId } = req.params;
        // User ID passed from BFF after authentication
        const { user_id } = req.body;

        if (!user_id) {
            return res.status(StatusCodes.BAD_REQUEST).json({
                error: 'user_id is required'
            });
        }

        const wishlist = await Wishlist.findOne({
            where: {
                wishlist_id: wishlistId,
                user_id // Ensure user owns this wishlist
            },
            include: [{
                model: WishlistItem,
                as: 'items'
            }]
        });

        if (!wishlist) {
            return res.status(StatusCodes.NOT_FOUND).json({
                error: 'Wishlist not found or access denied'
            });
        }

        if (wishlist.status !== 'ACTIVE') {
            return res.status(StatusCodes.BAD_REQUEST).json({
                error: `Cannot generate QR code for wishlist with status: ${wishlist.status}`
            });
        }

        // Check if expired
        if (new Date() > new Date(wishlist.expires_at)) {
            await wishlist.update({ status: 'EXPIRED' });
            return res.status(StatusCodes.GONE).json({
                error: 'Wishlist has expired'
            });
        }

        // Return QR code data
        const qrData = {
            wishlist_id: wishlist.wishlist_id,
            qr_token: wishlist.qr_code_token,
            items: wishlist.items.map(item => ({
                variant_id: item.shopify_variant_id,
                quantity: item.quantity
            }))
        };

        res.status(StatusCodes.OK).json({
            qr_data: qrData,
            qr_token: wishlist.qr_code_token,
            expires_at: wishlist.expires_at
        });

    } catch (error) {
        next(error);
    }
};
