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
        throw new Error('Shopify credentials not configured');
    }

    // Check cache first
    const cacheKey = generateProductsCacheKey(collection, limit, after, locations);
    const cached = await getCachedData(cacheKey);
    
    if (cached) {
        console.log(`🚀 Returning cached products (key: ${cacheKey})`);
        return cached;
    }

    let query;
    let variables = { limit };
    if (after) variables.after = after;

    if (collection) {
        console.log(`🔍 Querying specific collection: "${collection}"`);
        
        variables.handle = collection;
        
        query = `#graphql
            query GetCollectionProducts($handle: String!, $limit: Int!, $after: String) {
                collectionByHandle(handle: $handle) {
                    products(first: $limit, after: $after) {
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
                                            metafields(first: 5) {
                                                edges {
                                                    node {
                                                        key
                                                        value
                                                        namespace
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                                metafields(first: 5) {
                                    edges {
                                        node {
                                            key
                                            value
                                            namespace
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
            }
        `;
    } else {
        console.log(`🔍 Querying ALL products`);
        
        query = `#graphql
            query GetAllProducts($limit: Int!, $after: String) {
                products(first: $limit, after: $after) {
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
                                        metafields(first: 5) {
                                            edges {
                                                node {
                                                    key
                                                    value
                                                    namespace
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            metafields(first: 5) {
                                edges {
                                    node {
                                        key
                                        value
                                        namespace
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
    }

    try {
        const response = await axios.post(
            `https://${shopDomain}/admin/api/${apiVersion}/graphql.json`,
            { query, variables },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Shopify-Access-Token': accessToken
                }
            }
        );

        if (response.data.errors) {
            console.error('Shopify GraphQL errors:', JSON.stringify(response.data.errors, null, 2));
            throw new Error(`Shopify API error`);
        }

        let productsData;
        if (collection) {
            if (!response.data.data.collectionByHandle) {
                console.warn(`Collection "${collection}" not found in Shopify!`);
                productsData = { edges: [], pageInfo: { hasNextPage: false } };
            } else {
                productsData = response.data.data.collectionByHandle.products;
            }
        } else {
            productsData = response.data.data.products;
        }

        const result = {
            products: productsData.edges,
            pageInfo: productsData.pageInfo
        };

        // Cache the result (60s)
        await setCachedData(cacheKey, result, 60);

        console.log(`📦 Fetched ${result.products.length} products for collection: ${collection || 'ALL'}`);

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

async function fetchCollectionsDetails(handles) {
    if (!handles || handles.length === 0) {
        return [];
    }

    const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN;
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
    const apiVersion = process.env.SHOPIFY_API_VERSION || '2024-01';

    const query = `#graphql
      query GetCollections {
        ${handles.map((handle, index) => `
          collection${index}: collectionByHandle(handle: "${handle}") {
            id
            title
            handle
            description
            image {
              url
              altText
            }
          }
        `).join('\n')}
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
            return [];
        }

        const collections = Object.values(response.data.data)
            .filter(item => item !== null);

        return collections;

    } catch (error) {
        console.error('Error fetching collections details:', error.message);
        throw error;
    }
}

module.exports = {
    fetchProducts,
    fetchProduct,
    fetchCollectionsDetails
};
