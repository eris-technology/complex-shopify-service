/**
 * Mobile App Routes
 * 
 * Endpoints for mobile app
 * Service sits behind BFF - authentication handled there
 * user_id passed from BFF after JWT validation
 * 
 * Route Structure:
 * - POST   /api/mobile/wishlists            - Create wishlist from mobile app
 * - GET    /api/mobile/wishlists            - Get my wishlists
 * - GET    /api/mobile/wishlists/:id        - Get specific wishlist
 * - PUT    /api/mobile/wishlists/:id        - Update wishlist
 * - DELETE /api/mobile/wishlists/:id        - Delete wishlist
 * - POST   /api/mobile/wishlists/:id/qr     - Generate QR code for wishlist
 */

const express = require('express');
const router = express.Router();
const mobileController = require('../controllers/mobile.controller');

// Create wishlist from mobile app
router.post('/wishlists', mobileController.createWishlist);

// Get my wishlists
router.get('/wishlists', mobileController.getMyWishlists);

// Get specific wishlist
router.get('/wishlists/:wishlistId', mobileController.getWishlist);

// Update wishlist
router.put('/wishlists/:wishlistId', mobileController.updateWishlist);

// Delete wishlist
router.delete('/wishlists/:wishlistId', mobileController.deleteWishlist);

// Generate QR code for wishlist
router.post('/wishlists/:wishlistId/qr', mobileController.generateQRCode);

module.exports = router;
