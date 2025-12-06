const { Wishlist, WishlistItem } = require('../models');
const { StatusCodes } = require('http-status-codes');

/**
 * POS Controller
 * 
 * Handles POS extension specific operations
 * Authentication handled by BFF - service sits behind BFF
 */

/**
 * Fetch wishlist for POS processing
 * Validates QR token and marks it as used
 * POST /api/pos/wishlists/:wishlistId/fetch
 */
exports.fetchWishlist = async (req, res, next) => {
    try {
        const { wishlistId } = req.params;
        const { qr_token } = req.body;

        if (!qr_token) {
            return res.status(StatusCodes.BAD_REQUEST).json({
                error: 'qr_token is required'
            });
        }

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

        // Validate QR token
        if (wishlist.qr_code_token !== qr_token) {
            return res.status(StatusCodes.FORBIDDEN).json({
                error: 'Invalid QR code token'
            });
        }

        // Check if QR code already used
        if (wishlist.qr_code_used_at) {
            return res.status(StatusCodes.CONFLICT).json({
                error: 'QR code has already been used',
                used_at: wishlist.qr_code_used_at
            });
        }

        // Check if wishlist expired
        if (new Date() > new Date(wishlist.expires_at)) {
            await wishlist.update({ status: 'EXPIRED' });
            return res.status(StatusCodes.GONE).json({
                error: 'Wishlist has expired',
                expired_at: wishlist.expires_at
            });
        }

        // Check wishlist status
        if (wishlist.status !== 'ACTIVE') {
            return res.status(StatusCodes.BAD_REQUEST).json({
                error: `Wishlist is ${wishlist.status} and cannot be processed`
            });
        }

        // Mark QR code as used and update status
        await wishlist.update({
            qr_code_used_at: new Date(),
            status: 'PROCESSING'
        });

        // Fetch updated wishlist
        const updatedWishlist = await Wishlist.findByPk(wishlistId, {
            include: [{
                model: WishlistItem,
                as: 'items'
            }]
        });

        res.status(StatusCodes.OK).json({
            wishlist: updatedWishlist,
            message: 'Wishlist ready for processing'
        });

    } catch (error) {
        next(error);
    }
};

/**
 * Mark wishlist as completed
 * POST /api/pos/wishlists/:wishlistId/complete
 */
exports.completeWishlist = async (req, res, next) => {
    try {
        const { wishlistId } = req.params;
        const { processed_by, shopify_order_id } = req.body;

        const wishlist = await Wishlist.findByPk(wishlistId);

        if (!wishlist) {
            return res.status(StatusCodes.NOT_FOUND).json({
                error: 'Wishlist not found'
            });
        }

        if (wishlist.status !== 'PROCESSING') {
            return res.status(StatusCodes.BAD_REQUEST).json({
                error: `Cannot complete wishlist with status: ${wishlist.status}`
            });
        }

        // Update metadata with order information
        const metadata = { ...wishlist.metadata };
        if (shopify_order_id) {
            metadata.shopify_order_id = shopify_order_id;
        }

        await wishlist.update({
            status: 'COMPLETED',
            processed_at: new Date(),
            processed_by: processed_by || 'POS',
            metadata
        });

        res.status(StatusCodes.OK).json({
            message: 'Wishlist completed successfully',
            wishlist
        });

    } catch (error) {
        next(error);
    }
};

/**
 * Cancel wishlist from POS
 * POST /api/pos/wishlists/:wishlistId/cancel
 */
exports.cancelWishlist = async (req, res, next) => {
    try {
        const { wishlistId } = req.params;
        const { reason } = req.body;

        const wishlist = await Wishlist.findByPk(wishlistId);

        if (!wishlist) {
            return res.status(StatusCodes.NOT_FOUND).json({
                error: 'Wishlist not found'
            });
        }

        // Update metadata with cancellation reason
        const metadata = { ...wishlist.metadata };
        if (reason) {
            metadata.cancellation_reason = reason;
        }

        await wishlist.update({
            status: 'CANCELLED',
            metadata
        });

        res.status(StatusCodes.OK).json({
            message: 'Wishlist cancelled successfully',
            wishlist
        });

    } catch (error) {
        next(error);
    }
};

/**
 * Get wishlist status
 * GET /api/pos/wishlists/:wishlistId/status
 */
exports.getWishlistStatus = async (req, res, next) => {
    try {
        const { wishlistId } = req.params;

        const wishlist = await Wishlist.findByPk(wishlistId, {
            attributes: ['wishlist_id', 'status', 'qr_code_used_at', 'processed_at', 'expires_at']
        });

        if (!wishlist) {
            return res.status(StatusCodes.NOT_FOUND).json({
                error: 'Wishlist not found'
            });
        }

        res.status(StatusCodes.OK).json({
            status: wishlist.status,
            qr_code_used: !!wishlist.qr_code_used_at,
            processed: !!wishlist.processed_at,
            expired: new Date() > new Date(wishlist.expires_at)
        });

    } catch (error) {
        next(error);
    }
};
