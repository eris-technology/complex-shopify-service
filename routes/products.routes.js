/**
 * Products Routes
 * 
 * Product catalog endpoints for kiosk/mobile apps
 * Includes caching layer to avoid Shopify API spam
 * 
 * Route Structure:
 * - GET /api/products                  - Get products (with optional collection filter)
 * - GET /api/products/:productId       - Get single product
 */

const express = require('express');
const router = express.Router();
const productsController = require('../controllers/products.controller');

// Get products with optional filters
router.get('/', productsController.getProducts);

// Get single product
router.get('/:productId', productsController.getProduct);

module.exports = router;
