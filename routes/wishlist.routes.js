/**
 * Wishlist Routes
 * 
 * General wishlist management endpoints
 * 
 * Route Structure:
 * - POST   /api/wishlists               - Create wishlist
 * - GET    /api/wishlists/:id           - Get wishlist by ID
 * - GET    /api/wishlists               - Search wishlists (with filters)
 * - PUT    /api/wishlists/:id/items     - Update wishlist items
 * - DELETE /api/wishlists/:id           - Cancel/delete wishlist
 * - POST   /api/wishlists/:id/expire    - Manually expire wishlist
 */

const express = require('express');
const router = express.Router();
const wishlistController = require('../controllers/wishlist.controller');

// Create a new wishlist
router.post('/', wishlistController.createWishlist);

// Get wishlist by ID
router.get('/:wishlistId', wishlistController.getWishlist);

// Search wishlists (with filters)
router.get('/', wishlistController.searchWishlists);

// Update wishlist items
router.put('/:wishlistId/items', wishlistController.updateWishlistItems);

// Cancel wishlist
router.delete('/:wishlistId', wishlistController.cancelWishlist);

// Manually expire wishlist
router.post('/:wishlistId/expire', wishlistController.expireWishlist);

module.exports = router;
