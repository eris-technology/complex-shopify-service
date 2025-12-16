const { StatusCodes } = require('http-status-codes');

/**
 * POS Authentication Middleware
 * 
 * Validates that requests to POS endpoints include the correct secret token.
 * This protects POS endpoints which are exposed to the internet (Shopify POS extension).
 * 
 * BFF-accessed endpoints (mobile, wishlist) do not use this middleware as they
 * are protected by the BFF's authentication layer.
 */

const posAuthMiddleware = (req, res, next) => {
    const posSecret = process.env.POS_SECRET_TOKEN;

    // If no secret is configured, deny access in production
    if (!posSecret) {
        if (process.env.NODE_ENV === 'production') {
            console.error('POS_SECRET_TOKEN not configured in production environment');
            return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
                error: 'Service configuration error'
            });
        }
        // In development/test, allow if not configured
        console.warn('POS_SECRET_TOKEN not configured - allowing access in non-production environment');
        return next();
    }

    // Get token from header
    const authHeader = req.headers['x-pos-secret'] || req.headers['x-pos-token'];

    if (!authHeader) {
        return res.status(StatusCodes.UNAUTHORIZED).json({
            error: 'POS authentication required',
            message: 'Missing x-pos-secret header'
        });
    }

    // Validate token
    if (authHeader !== posSecret) {
        return res.status(StatusCodes.FORBIDDEN).json({
            error: 'Invalid POS credentials',
            message: 'Invalid x-pos-secret token'
        });
    }

    // Token is valid, proceed
    next();
};

module.exports = posAuthMiddleware;
