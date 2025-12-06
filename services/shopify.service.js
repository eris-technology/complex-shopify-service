const axios = require('axios');
const { getCachedData, setCachedData, generateProductsCacheKey } = require('../utils/cache');

/**
 * Shopify Service
 * 
 * Handles interactions with Shopify Admin API
 * Includes caching layer (in-memory or Redis)
 */

/**
 * Fetch products from Shopify with caching
 */
async function fetchProducts(options = {}) {
    const {
        collection = null,
        limit = 50,
        after = null,
        locations = null
    } = options;

    const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN;
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
    const apiVersion = process.env.SHOPIFY_API_VERSION || '2024-01';

    if (!shopDomain || !accessToken) {
        throw new Error('Shopify credentials not configured (SHOPIFY_SHOP_DOMAIN, SHOPIFY_ACCESS_TOKEN)');
    }

    // Check cache first
    const cacheKey = generateProductsCacheKey(collection, limit, after, locations);
    const cached = await getCachedData(cacheKey);
    
    if (cached) {
        return cached;
    }

    // Build GraphQL query
    let collectionFilter = '';
    if (collection) {
        collectionFilter = `, query: "collection:${collection}"`;
    }

    let afterClause = '';
    if (after) {
        afterClause = `, after: "${after}"`;
    }

    const query = `#graphql
        query GetProducts {
            products(first: ${limit}${collectionFilter}${afterClause}) {
                edges {
                    node {
                        id
                        title
                        handle
                        description
                        tags
                        productType
                        vendor
                        status
                        images(first: 5) {
                            edges {
                                node {
                                    url
                                    altText
                                }
                            }
                        }
                        variants(first: 50) {
                            edges {
                                node {
                                    id
                                    title
                                    sku
                                    barcode
                                    price
                                    compareAtPrice
                                    availableForSale
                                    inventoryQuantity
                                    image {
                                        url
                                        altText
                                    }
                                }
                            }
                        }
                    }
                    cursor
                }
                pageInfo {
                    hasNextPage
                    endCursor
                }
            }
        }
    `;

    try {
        const response = await axios.post(
            `https://${shopDomain}/admin/api/${apiVersion}/graphql.json`,
            { query },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Shopify-Access-Token': accessToken
                }
            }
        );

        if (response.data.errors) {
            console.error('Shopify GraphQL errors:', response.data.errors);
            throw new Error(`Shopify API error: ${response.data.errors[0].message}`);
        }

        const result = {
            products: response.data.data.products.edges,
            pageInfo: response.data.data.products.pageInfo
        };

        // Cache the result (30-60 seconds depending on location filtering)
        const cacheTTL = locations ? 30 : 60;
        await setCachedData(cacheKey, result, cacheTTL);

        console.log(`📦 Fetched ${result.products.length} products from Shopify (cached for ${cacheTTL}s)`);

        return result;

    } catch (error) {
        console.error('Error fetching products from Shopify:', error.message);
        throw error;
    }
}

/**
 * Fetch single product by ID
 */
async function fetchProduct(productId) {
    const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN;
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
    const apiVersion = process.env.SHOPIFY_API_VERSION || '2024-01';

    if (!shopDomain || !accessToken) {
        throw new Error('Shopify credentials not configured');
    }

    // Check cache
    const cacheKey = `product:${productId}`;
    const cached = await getCachedData(cacheKey);
    
    if (cached) {
        return cached;
    }

    const query = `#graphql
        query GetProduct($id: ID!) {
            product(id: $id) {
                id
                title
                handle
                description
                tags
                productType
                vendor
                status
                images(first: 10) {
                    edges {
                        node {
                            url
                            altText
                        }
                    }
                }
                variants(first: 100) {
                    edges {
                        node {
                            id
                            title
                            sku
                            barcode
                            price
                            compareAtPrice
                            availableForSale
                            inventoryQuantity
                            image {
                                url
                                altText
                            }
                        }
                    }
                }
            }
        }
    `;

    try {
        const response = await axios.post(
            `https://${shopDomain}/admin/api/${apiVersion}/graphql.json`,
            { 
                query,
                variables: { id: productId }
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Shopify-Access-Token': accessToken
                }
            }
        );

        if (response.data.errors) {
            throw new Error(`Shopify API error: ${response.data.errors[0].message}`);
        }

        const product = response.data.data.product;

        // Cache for 60 seconds
        await setCachedData(cacheKey, product, 60);

        return product;

    } catch (error) {
        console.error('Error fetching product from Shopify:', error.message);
        throw error;
    }
}

module.exports = {
    fetchProducts,
    fetchProduct
};
