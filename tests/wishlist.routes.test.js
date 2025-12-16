const request = require('supertest');
const { app } = require('../index');
const { Wishlist, WishlistItem, Idempotency } = require('../models');
const { sequelize } = require('complex-common-utils');

describe('Wishlist Routes', () => {

  beforeAll(async () => {
    // Initialize database
    await sequelize.sync({ force: true });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    // Clean database before each test
    await WishlistItem.destroy({ where: {}, force: true });
    await Wishlist.destroy({ where: {}, force: true });
    await Idempotency.destroy({ where: {}, force: true });
  });

  describe('POST /api/wishlists', () => {
    it('should create a wishlist with valid data', async () => {
      const wishlistData = {
        user_id: 'user-123',
        source: 'KIOSK',
        items: [
          {
            variant_id: 'gid://shopify/ProductVariant/123',
            product_id: 'gid://shopify/Product/456',
            quantity: 2,
            product_title: 'Test Product',
            variant_title: 'Large',
            price: '50.00',
            currency: 'HKD'
          }
        ],
        metadata: {
          kiosk_id: 'KIOSK-001',
          location: 'Store A'
        }
      };

      const response = await request(app)
        .post('/api/wishlists')
        .send(wishlistData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('wishlist');
      expect(response.body).toHaveProperty('qr_code_token');
      expect(response.body.wishlist.user_id).toBe('user-123');
      expect(response.body.wishlist.status).toBe('ACTIVE');
      expect(response.body.wishlist.source).toBe('KIOSK');
      expect(response.body.wishlist.items).toHaveLength(1);
      expect(response.body.wishlist.expires_at).toBeDefined();
    });

    it('should create wishlist with multiple items', async () => {
      const wishlistData = {
        user_id: 'user-456',
        source: 'MOBILE_APP',
        items: [
          {
            variant_id: 'gid://shopify/ProductVariant/111',
            product_id: 'gid://shopify/Product/222',
            quantity: 1,
            product_title: 'Product 1',
            price: '10.00',
            currency: 'HKD'
          },
          {
            variant_id: 'gid://shopify/ProductVariant/333',
            product_id: 'gid://shopify/Product/444',
            quantity: 3,
            product_title: 'Product 2',
            price: '20.00',
            currency: 'HKD'
          },
          {
            variant_id: 'gid://shopify/ProductVariant/555',
            product_id: 'gid://shopify/Product/666',
            quantity: 2,
            product_title: 'Product 3',
            price: '15.00',
            currency: 'HKD'
          }
        ]
      };

      const response = await request(app)
        .post('/api/wishlists')
        .send(wishlistData);

      expect(response.status).toBe(201);
      expect(response.body.wishlist.items).toHaveLength(3);
    });

    it('should handle idempotency key', async () => {
      const wishlistData = {
        user_id: 'user-789',
        items: [
          {
            variant_id: 'gid://shopify/ProductVariant/123',
            product_id: 'gid://shopify/Product/456',
            quantity: 1,
            product_title: 'Test Product',
            price: '25.00'
          }
        ]
      };

      const idempotencyKey = 'unique-key-12345';

      // First request
      const response1 = await request(app)
        .post('/api/wishlists')
        .set('idempotency-key', idempotencyKey)
        .send(wishlistData);

      expect(response1.status).toBe(201);
      const wishlistId1 = response1.body.wishlist.wishlist_id;

      // Second request with same idempotency key
      const response2 = await request(app)
        .post('/api/wishlists')
        .set('idempotency-key', idempotencyKey)
        .send(wishlistData);

      expect(response2.status).toBe(200);
      expect(response2.body.wishlist.wishlist_id).toBe(wishlistId1);
    });

    it('should reject request without user_id', async () => {
      const wishlistData = {
        items: [
          {
            variant_id: 'gid://shopify/ProductVariant/123',
            product_id: 'gid://shopify/Product/456',
            quantity: 1,
            product_title: 'Test Product',
            price: '25.00'
          }
        ]
      };

      const response = await request(app)
        .post('/api/wishlists')
        .send(wishlistData);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'user_id is required');
    });

    it('should reject request without items', async () => {
      const wishlistData = {
        user_id: 'user-123'
      };

      const response = await request(app)
        .post('/api/wishlists')
        .send(wishlistData);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('items');
    });

    it('should reject request with empty items array', async () => {
      const wishlistData = {
        user_id: 'user-123',
        items: []
      };

      const response = await request(app)
        .post('/api/wishlists')
        .send(wishlistData);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('items');
    });

    it('should default to KIOSK source if not specified', async () => {
      const wishlistData = {
        user_id: 'user-123',
        items: [
          {
            variant_id: 'gid://shopify/ProductVariant/123',
            product_id: 'gid://shopify/Product/456',
            quantity: 1,
            product_title: 'Test Product',
            price: '25.00'
          }
        ]
      };

      const response = await request(app)
        .post('/api/wishlists')
        .send(wishlistData);

      expect(response.status).toBe(201);
      expect(response.body.wishlist.source).toBe('KIOSK');
    });
  });

  describe('GET /api/wishlists/:wishlistId', () => {
    let testWishlist;

    beforeEach(async () => {
      testWishlist = await Wishlist.create({
        user_id: 'user-123',
        status: 'ACTIVE',
        source: 'KIOSK',
        qr_code_token: 'token-123',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });

      await WishlistItem.create({
        wishlist_id: testWishlist.wishlist_id,
        shopify_variant_id: 'var-1',
        shopify_product_id: 'prod-1',
        quantity: 2,
        product_title: 'Test Product',
        price: '30.00',
        currency: 'HKD'
      });
    });

    it('should get a wishlist by ID', async () => {
      const response = await request(app)
        .get(`/api/wishlists/${testWishlist.wishlist_id}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('wishlist');
      expect(response.body.wishlist.wishlist_id).toBe(testWishlist.wishlist_id);
      expect(response.body.wishlist.items).toHaveLength(1);
    });

    it('should return 404 for non-existent wishlist', async () => {
      const response = await request(app)
        .get('/api/wishlists/00000000-0000-0000-0000-000000000000');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Wishlist not found');
    });
  });

  describe('GET /api/wishlists (search)', () => {
    beforeEach(async () => {
      // Create test wishlists
      const wishlist1 = await Wishlist.create({
        user_id: 'user-123',
        status: 'ACTIVE',
        source: 'KIOSK',
        qr_code_token: 'token-1',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });

      const wishlist2 = await Wishlist.create({
        user_id: 'user-123',
        status: 'COMPLETED',
        source: 'MOBILE_APP',
        qr_code_token: 'token-2',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
        processed_at: new Date()
      });

      await Wishlist.create({
        user_id: 'user-456',
        status: 'ACTIVE',
        source: 'KIOSK',
        qr_code_token: 'token-3',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });

      await WishlistItem.create({
        wishlist_id: wishlist1.wishlist_id,
        shopify_variant_id: 'var-1',
        shopify_product_id: 'prod-1',
        quantity: 1,
        product_title: 'Product 1',
        price: '10.00',
        currency: 'HKD'
      });
    });

    it('should search wishlists by user_id', async () => {
      const response = await request(app)
        .get('/api/wishlists')
        .query({ user_id: 'user-123' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('wishlists');
      expect(response.body).toHaveProperty('total', 2);
      expect(response.body.wishlists).toHaveLength(2);
    });

    it('should filter wishlists by status', async () => {
      const response = await request(app)
        .get('/api/wishlists')
        .query({ user_id: 'user-123', status: 'ACTIVE' });

      expect(response.status).toBe(200);
      expect(response.body.total).toBe(1);
      expect(response.body.wishlists[0].status).toBe('ACTIVE');
    });

    it('should filter wishlists by source', async () => {
      const response = await request(app)
        .get('/api/wishlists')
        .query({ user_id: 'user-123', source: 'MOBILE_APP' });

      expect(response.status).toBe(200);
      expect(response.body.total).toBe(1);
      expect(response.body.wishlists[0].source).toBe('MOBILE_APP');
    });

    it('should respect limit and offset', async () => {
      const response = await request(app)
        .get('/api/wishlists')
        .query({ limit: 1, offset: 0 });

      expect(response.status).toBe(200);
      expect(response.body.wishlists).toHaveLength(1);
      expect(response.body.limit).toBe(1);
      expect(response.body.offset).toBe(0);
    });

    it('should return all wishlists without filters', async () => {
      const response = await request(app)
        .get('/api/wishlists');

      expect(response.status).toBe(200);
      expect(response.body.total).toBe(3);
    });
  });

  describe('PUT /api/wishlists/:wishlistId/items', () => {
    let testWishlist;

    beforeEach(async () => {
      testWishlist = await Wishlist.create({
        user_id: 'user-123',
        status: 'ACTIVE',
        source: 'KIOSK',
        qr_code_token: 'token-123',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });

      await WishlistItem.create({
        wishlist_id: testWishlist.wishlist_id,
        shopify_variant_id: 'var-old',
        shopify_product_id: 'prod-old',
        quantity: 1,
        product_title: 'Old Product',
        price: '10.00',
        currency: 'HKD'
      });
    });

    it('should update wishlist items', async () => {
      const updateData = {
        items: [
          {
            variant_id: 'gid://shopify/ProductVariant/new1',
            product_id: 'gid://shopify/Product/new1',
            quantity: 2,
            product_title: 'New Product 1',
            price: '20.00',
            currency: 'HKD'
          },
          {
            variant_id: 'gid://shopify/ProductVariant/new2',
            product_id: 'gid://shopify/Product/new2',
            quantity: 3,
            product_title: 'New Product 2',
            price: '30.00',
            currency: 'HKD'
          }
        ]
      };

      const response = await request(app)
        .put(`/api/wishlists/${testWishlist.wishlist_id}/items`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('wishlist');
      expect(response.body.wishlist.items).toHaveLength(2);
      expect(response.body.wishlist.items[0].product_title).toBe('New Product 1');
      expect(response.body.wishlist.items[1].product_title).toBe('New Product 2');
    });

    it('should return 404 for non-existent wishlist', async () => {
      const updateData = {
        items: []
      };

      const response = await request(app)
        .put('/api/wishlists/00000000-0000-0000-0000-000000000000/items')
        .send(updateData);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Wishlist not found');
    });

    it('should reject update of non-active wishlist', async () => {
      await testWishlist.update({ status: 'COMPLETED' });

      const updateData = {
        items: []
      };

      const response = await request(app)
        .put(`/api/wishlists/${testWishlist.wishlist_id}/items`)
        .send(updateData);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Cannot update wishlist');
    });
  });

  describe('DELETE /api/wishlists/:wishlistId', () => {
    let testWishlist;

    beforeEach(async () => {
      testWishlist = await Wishlist.create({
        user_id: 'user-123',
        status: 'ACTIVE',
        source: 'KIOSK',
        qr_code_token: 'token-123',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });
    });

    it('should cancel a wishlist', async () => {
      const response = await request(app)
        .delete(`/api/wishlists/${testWishlist.wishlist_id}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Wishlist cancelled successfully');
      expect(response.body.wishlist.status).toBe('CANCELLED');
    });

    it('should return 404 for non-existent wishlist', async () => {
      const response = await request(app)
        .delete('/api/wishlists/00000000-0000-0000-0000-000000000000');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Wishlist not found');
    });

    it('should allow cancelling already cancelled wishlist', async () => {
      await testWishlist.update({ status: 'CANCELLED' });

      const response = await request(app)
        .delete(`/api/wishlists/${testWishlist.wishlist_id}`);

      expect(response.status).toBe(200);
      expect(response.body.wishlist.status).toBe('CANCELLED');
    });
  });

  describe('POST /api/wishlists/:wishlistId/expire', () => {
    let testWishlist;

    beforeEach(async () => {
      testWishlist = await Wishlist.create({
        user_id: 'user-123',
        status: 'ACTIVE',
        source: 'KIOSK',
        qr_code_token: 'token-123',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });
    });

    it('should manually expire a wishlist', async () => {
      const response = await request(app)
        .post(`/api/wishlists/${testWishlist.wishlist_id}/expire`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Wishlist expired successfully');
      expect(response.body.wishlist.status).toBe('EXPIRED');
    });

    it('should return 404 for non-existent wishlist', async () => {
      const response = await request(app)
        .post('/api/wishlists/00000000-0000-0000-0000-000000000000/expire');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Wishlist not found');
    });

    it('should allow expiring already expired wishlist', async () => {
      await testWishlist.update({ status: 'EXPIRED' });

      const response = await request(app)
        .post(`/api/wishlists/${testWishlist.wishlist_id}/expire`);

      expect(response.status).toBe(200);
      expect(response.body.wishlist.status).toBe('EXPIRED');
    });

    it('should allow expiring completed wishlist', async () => {
      await testWishlist.update({ status: 'COMPLETED' });

      const response = await request(app)
        .post(`/api/wishlists/${testWishlist.wishlist_id}/expire`);

      expect(response.status).toBe(200);
      expect(response.body.wishlist.status).toBe('EXPIRED');
    });
  });
});
