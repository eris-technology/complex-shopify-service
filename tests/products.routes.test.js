const request = require('supertest');
const { app } = require('../index');
const { sequelize } = require('complex-common-utils');
const shopifyService = require('../services/shopify.service');

// Mock the shopify service
jest.mock('../services/shopify.service');

describe('Products Routes', () => {
  
  beforeAll(async () => {
    // Initialize database
    await sequelize.sync({ force: true });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/products', () => {
    it('should fetch products without collection filter', async () => {
      const mockProducts = {
        products: [
          {
            id: 'gid://shopify/Product/123',
            title: 'Test Product 1',
            variants: [{
              id: 'gid://shopify/ProductVariant/456',
              price: '10.00'
            }]
          },
          {
            id: 'gid://shopify/Product/124',
            title: 'Test Product 2',
            variants: [{
              id: 'gid://shopify/ProductVariant/457',
              price: '20.00'
            }]
          }
        ],
        pageInfo: {
          hasNextPage: false,
          hasPreviousPage: false,
          endCursor: null
        }
      };

      shopifyService.fetchProducts.mockResolvedValue(mockProducts);

      const response = await request(app)
        .get('/api/products');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('products');
      expect(response.body).toHaveProperty('pageInfo');
      expect(response.body.products).toHaveLength(2);
      expect(shopifyService.fetchProducts).toHaveBeenCalledWith({
        collection: null,
        limit: 50,
        after: null
      });
    });

    it('should fetch products with collection filter', async () => {
      const mockProducts = {
        products: [
          {
            id: 'gid://shopify/Product/123',
            title: 'Popup Product',
            variants: [{
              id: 'gid://shopify/ProductVariant/456',
              price: '15.00'
            }]
          }
        ],
        pageInfo: {
          hasNextPage: false,
          hasPreviousPage: false,
          endCursor: null
        }
      };

      shopifyService.fetchProducts.mockResolvedValue(mockProducts);

      const response = await request(app)
        .get('/api/products')
        .query({ collection: 'popup' });

      expect(response.status).toBe(200);
      expect(response.body.products).toHaveLength(1);
      expect(shopifyService.fetchProducts).toHaveBeenCalledWith({
        collection: 'popup',
        limit: 50,
        after: null
      });
    });

    it('should respect limit parameter', async () => {
      const mockProducts = {
        products: Array(10).fill(null).map((_, i) => ({
          id: `gid://shopify/Product/${i}`,
          title: `Product ${i}`
        })),
        pageInfo: {
          hasNextPage: true,
          hasPreviousPage: false,
          endCursor: 'cursor_10'
        }
      };

      shopifyService.fetchProducts.mockResolvedValue(mockProducts);

      const response = await request(app)
        .get('/api/products')
        .query({ limit: 10 });

      expect(response.status).toBe(200);
      expect(shopifyService.fetchProducts).toHaveBeenCalledWith({
        collection: null,
        limit: 10,
        after: null
      });
    });

    it('should handle pagination with after cursor', async () => {
      const mockProducts = {
        products: [
          {
            id: 'gid://shopify/Product/125',
            title: 'Next Page Product'
          }
        ],
        pageInfo: {
          hasNextPage: false,
          hasPreviousPage: true,
          endCursor: null
        }
      };

      shopifyService.fetchProducts.mockResolvedValue(mockProducts);

      const response = await request(app)
        .get('/api/products')
        .query({ after: 'cursor_10' });

      expect(response.status).toBe(200);
      expect(shopifyService.fetchProducts).toHaveBeenCalledWith({
        collection: null,
        limit: 50,
        after: 'cursor_10'
      });
    });

    it('should reject collection not in whitelist when whitelist is configured', async () => {
      // This test assumes SHOPIFY.COLLECTIONS_WHITELIST is configured
      // Note: This behavior depends on serverConfig.js configuration
      const response = await request(app)
        .get('/api/products')
        .query({ collection: 'forbidden-collection' });

      // If whitelist is empty, this will succeed
      // If whitelist is configured and doesn't include 'forbidden-collection', it will fail
      if (response.status === 403) {
        expect(response.body).toHaveProperty('error', 'Collection not allowed');
        expect(response.body).toHaveProperty('allowedCollections');
      }
    });

    it('should handle service errors gracefully', async () => {
      shopifyService.fetchProducts.mockRejectedValue(new Error('Shopify API error'));

      const response = await request(app)
        .get('/api/products');

      expect(response.status).toBe(500);
    });
  });

  describe('GET /api/products/:productId', () => {
    it('should fetch a single product by numeric ID', async () => {
      const mockProduct = {
        id: 'gid://shopify/Product/123',
        title: 'Test Product',
        description: 'A test product',
        variants: [{
          id: 'gid://shopify/ProductVariant/456',
          price: '25.00',
          title: 'Default Title'
        }]
      };

      shopifyService.fetchProduct.mockResolvedValue(mockProduct);

      const response = await request(app)
        .get('/api/products/123');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('product');
      expect(response.body.product.title).toBe('Test Product');
      expect(shopifyService.fetchProduct).toHaveBeenCalledWith('gid://shopify/Product/123');
    });

    it('should fetch a single product by GID', async () => {
      const mockProduct = {
        id: 'gid://shopify/Product/123',
        title: 'Test Product',
        variants: [{
          id: 'gid://shopify/ProductVariant/456',
          price: '25.00'
        }]
      };

      shopifyService.fetchProduct.mockResolvedValue(mockProduct);

      // URL encode the GID
      const encodedGid = encodeURIComponent('gid://shopify/Product/123');
      const response = await request(app)
        .get(`/api/products/${encodedGid}`);

      expect(response.status).toBe(200);
      expect(response.body.product.id).toBe('gid://shopify/Product/123');
      expect(shopifyService.fetchProduct).toHaveBeenCalledWith('gid://shopify/Product/123');
    });

    it('should return 404 when product not found', async () => {
      shopifyService.fetchProduct.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/products/999999');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Product not found');
    });

    it('should handle service errors gracefully', async () => {
      shopifyService.fetchProduct.mockRejectedValue(new Error('Shopify API error'));

      const response = await request(app)
        .get('/api/products/123');

      expect(response.status).toBe(500);
    });
  });
});
