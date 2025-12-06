/**
 * POS Extension Routes
 * 
 * Endpoints specifically for Shopify POS extension
 * Service sits behind BFF - authentication handled there
 * 
 * Route Structure:
 * - POST   /api/pos/wishlists/:id/fetch      - Fetch wishlist for processing (validates QR token)
 * - POST   /api/pos/wishlists/:id/complete   - Mark wishlist as completed
 * - POST   /api/pos/wishlists/:id/cancel     - Cancel wishlist from POS
 * - GET    /api/pos/wishlists/:id/status     - Check wishlist status
 */

const express = require('express');
const router = express.Router();
const posController = require('../controllers/pos.controller');

// Fetch wishlist for POS processing (validates QR token)
router.post('/wishlists/:wishlistId/fetch', posController.fetchWishlist);

// Mark wishlist as completed
router.post('/wishlists/:wishlistId/complete', posController.completeWishlist);

// Cancel wishlist from POS
router.post('/wishlists/:wishlistId/cancel', posController.cancelWishlist);

// Check wishlist status
router.get('/wishlists/:wishlistId/status', posController.getWishlistStatus);

module.exports = router;
