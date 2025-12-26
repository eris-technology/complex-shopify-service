const shopifyService = require('../services/shopify.service');
const { StatusCodes } = require('http-status-codes');
const config = require('../config/serverConfig');

exports.getWhitelistedCollections = async (req, res, next) => {
    try {
        const whitelist = config.SHOPIFY.COLLECTIONS_WHITELIST;

        if (!whitelist || whitelist.length === 0) {
            return res.status(StatusCodes.OK).json({ collections: [] });
        }

        const collections = await shopifyService.fetchCollectionsDetails(whitelist);

        res.status(StatusCodes.OK).json({ collections });
    } catch (error) {
        next(error);
    }
};