const express = require('express');
const router = express.Router();

// Import route modules here
const wishlistRoutes = require('./wishlist.routes');
const posRoutes = require('./pos.routes');
const mobileRoutes = require('./mobile.routes');
const productsRoutes = require('./products.routes');
const collectionRoutes = require('./collections.routes')

// Register routes
router.use('/wishlists', wishlistRoutes); // General wishlist operations
router.use('/pos', posRoutes); // POS extension specific endpoints
router.use('/mobile', mobileRoutes); // Mobile app specific endpoints
router.use('/products', productsRoutes); // Product catalog endpoints
router.use('/collections', collectionRoutes); // collections catalog endpoints

// Default API route
router.get('/', (req, res) => {
    res.json({
        message: 'Complex Shopify Service API',
        version: '1.0.0',
        endpoints: {
            health: '/health',
            documentation: '/api-docs',
            api: '/api',
            products: '/api/products',
            wishlists: '/api/wishlists',
            pos: '/api/pos',
            mobile: '/api/mobile',
            collection: 'api/collections'
        }
    });
});

module.exports = router;
