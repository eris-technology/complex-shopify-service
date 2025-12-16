/**
 * POS Extension Routes
 * 
 * Endpoints specifically for Shopify POS extension
 * These endpoints are internet-facing and protected with POS secret token
 * 
 * Route Structure:
 * - POST   /api/pos/wishlists/fetch-by-qr    - Fetch wishlist by QR token (real QR scan)
 * - POST   /api/pos/wishlists/:id/fetch      - Fetch wishlist for processing (validates QR token)
 * - POST   /api/pos/wishlists/:id/complete   - Mark wishlist as completed
 * - POST   /api/pos/wishlists/:id/cancel     - Cancel wishlist from POS
 * - GET    /api/pos/wishlists/:id/status     - Check wishlist status
 */

const express = require('express');
const router = express.Router();
const posController = require('../controllers/pos.controller');
const posAuthMiddleware = require('../middleware/posAuth');

// Apply POS authentication middleware to all routes
router.use(posAuthMiddleware);

// Fetch wishlist by QR token only (real QR scan)
router.post('/wishlists/fetch-by-qr', posController.fetchByQRToken);

// Fetch wishlist for POS processing (validates QR token)
router.post('/wishlists/:wishlistId/fetch', posController.fetchWishlist);

// Mark wishlist as completed
router.post('/wishlists/:wishlistId/complete', posController.completeWishlist);

// Cancel wishlist from POS
router.post('/wishlists/:wishlistId/cancel', posController.cancelWishlist);

// Check wishlist status
router.get('/wishlists/:wishlistId/status', posController.getWishlistStatus);

module.exports = router;
