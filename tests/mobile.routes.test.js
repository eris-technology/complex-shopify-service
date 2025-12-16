const request = require('supertest');
const { app } = require('../index');
const { Wishlist, WishlistItem } = require('../models');
const { sequelize } = require('complex-common-utils');

describe('Mobile Routes', () => {

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
  });

  describe('POST /api/mobile/wishlists', () => {
    it('should create a wishlist from mobile app', async () => {
      const wishlistData = {
        user_id: 'mobile-user-123',
        items: [
          {
            variant_id: 'gid://shopify/ProductVariant/123',
            product_id: 'gid://shopify/Product/456',
            quantity: 2,
            product_title: 'Test Product',
            variant_title: 'Medium',
            price: '25.00',
            currency: 'HKD'
          }
        ],
        metadata: {
          device_type: 'iOS',
          app_version: '1.0.0'
        }
      };

      const response = await request(app)
        .post('/api/mobile/wishlists')
        .send(wishlistData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('wishlist');
      expect(response.body.wishlist.user_id).toBe('mobile-user-123');
      expect(response.body.wishlist.status).toBe('ACTIVE');
      expect(response.body.wishlist.source).toBe('MOBILE_APP');
      expect(response.body.wishlist.items).toHaveLength(1);
      expect(response.body.wishlist.items[0].product_title).toBe('Test Product');
      expect(response.body.wishlist.qr_code_token).toBeDefined();
      expect(response.body.wishlist.expires_at).toBeDefined();
    });

    it('should create wishlist with multiple items', async () => {
      const wishlistData = {
        user_id: 'mobile-user-456',
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
            price: '15.00',
            currency: 'HKD'
          }
        ]
      };

      const response = await request(app)
        .post('/api/mobile/wishlists')
        .send(wishlistData);

      expect(response.status).toBe(201);
      expect(response.body.wishlist.items).toHaveLength(2);
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
        .post('/api/mobile/wishlists')
        .send(wishlistData);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'user_id is required');
    });

    it('should reject request without items', async () => {
      const wishlistData = {
        user_id: 'mobile-user-123'
      };

      const response = await request(app)
        .post('/api/mobile/wishlists')
        .send(wishlistData);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('items');
    });

    it('should reject request with empty items array', async () => {
      const wishlistData = {
        user_id: 'mobile-user-123',
        items: []
      };

      const response = await request(app)
        .post('/api/mobile/wishlists')
        .send(wishlistData);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('items');
    });
  });

  describe('GET /api/mobile/wishlists', () => {
    beforeEach(async () => {
      // Create test wishlists
      const wishlist1 = await Wishlist.create({
        user_id: 'mobile-user-123',
        status: 'ACTIVE',
        source: 'MOBILE_APP',
        qr_code_token: 'token-123',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });

      const wishlist2 = await Wishlist.create({
        user_id: 'mobile-user-123',
        status: 'COMPLETED',
        source: 'MOBILE_APP',
        qr_code_token: 'token-456',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
        processed_at: new Date()
      });

      await Wishlist.create({
        user_id: 'other-user-999',
        status: 'ACTIVE',
        source: 'MOBILE_APP',
        qr_code_token: 'token-789',
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

    it('should get all wishlists for a user', async () => {
      const response = await request(app)
        .get('/api/mobile/wishlists')
        .query({ user_id: 'mobile-user-123' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('wishlists');
      expect(response.body).toHaveProperty('total', 2);
      expect(response.body.wishlists).toHaveLength(2);
      expect(response.body.wishlists[0].user_id).toBe('mobile-user-123');
    });

    it('should filter wishlists by status', async () => {
      const response = await request(app)
        .get('/api/mobile/wishlists')
        .query({ user_id: 'mobile-user-123', status: 'ACTIVE' });

      expect(response.status).toBe(200);
      expect(response.body.total).toBe(1);
      expect(response.body.wishlists[0].status).toBe('ACTIVE');
    });

    it('should respect limit and offset', async () => {
      const response = await request(app)
        .get('/api/mobile/wishlists')
        .query({ user_id: 'mobile-user-123', limit: 1, offset: 0 });

      expect(response.status).toBe(200);
      expect(response.body.wishlists).toHaveLength(1);
      expect(response.body.limit).toBe(1);
      expect(response.body.offset).toBe(0);
    });

    it('should reject request without user_id', async () => {
      const response = await request(app)
        .get('/api/mobile/wishlists');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'user_id query parameter is required');
    });
  });

  describe('GET /api/mobile/wishlists/:wishlistId', () => {
    let testWishlist;

    beforeEach(async () => {
      testWishlist = await Wishlist.create({
        user_id: 'mobile-user-123',
        status: 'ACTIVE',
        source: 'MOBILE_APP',
        qr_code_token: 'token-123',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });

      await WishlistItem.create({
        wishlist_id: testWishlist.wishlist_id,
        shopify_variant_id: 'var-1',
        shopify_product_id: 'prod-1',
        quantity: 2,
        product_title: 'Test Product',
        price: '20.00',
        currency: 'HKD'
      });
    });

    it('should get a specific wishlist by ID', async () => {
      const response = await request(app)
        .get(`/api/mobile/wishlists/${testWishlist.wishlist_id}`)
        .query({ user_id: 'mobile-user-123' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('wishlist');
      expect(response.body.wishlist.wishlist_id).toBe(testWishlist.wishlist_id);
      expect(response.body.wishlist.items).toHaveLength(1);
    });

    it('should return 404 for non-existent wishlist', async () => {
      const response = await request(app)
        .get('/api/mobile/wishlists/00000000-0000-0000-0000-000000000000')
        .query({ user_id: 'mobile-user-123' });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Wishlist not found or access denied');
    });

    it('should deny access to wishlist owned by another user', async () => {
      const response = await request(app)
        .get(`/api/mobile/wishlists/${testWishlist.wishlist_id}`)
        .query({ user_id: 'different-user-999' });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Wishlist not found or access denied');
    });

    it('should reject request without user_id', async () => {
      const response = await request(app)
        .get(`/api/mobile/wishlists/${testWishlist.wishlist_id}`);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'user_id query parameter is required');
    });
  });

  describe('PUT /api/mobile/wishlists/:wishlistId', () => {
    let testWishlist;

    beforeEach(async () => {
      testWishlist = await Wishlist.create({
        user_id: 'mobile-user-123',
        status: 'ACTIVE',
        source: 'MOBILE_APP',
        qr_code_token: 'token-123',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });

      await WishlistItem.create({
        wishlist_id: testWishlist.wishlist_id,
        shopify_variant_id: 'var-1',
        shopify_product_id: 'prod-1',
        quantity: 1,
        product_title: 'Old Product',
        price: '10.00',
        currency: 'HKD'
      });
    });

    it('should update wishlist items', async () => {
      const updateData = {
        user_id: 'mobile-user-123',
        items: [
          {
            variant_id: 'gid://shopify/ProductVariant/999',
            product_id: 'gid://shopify/Product/888',
            quantity: 3,
            product_title: 'New Product',
            price: '30.00',
            currency: 'HKD'
          }
        ]
      };

      const response = await request(app)
        .put(`/api/mobile/wishlists/${testWishlist.wishlist_id}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('wishlist');
      expect(response.body.wishlist.items).toHaveLength(1);
      expect(response.body.wishlist.items[0].product_title).toBe('New Product');
    });

    it('should update wishlist metadata', async () => {
      const updateData = {
        user_id: 'mobile-user-123',
        metadata: {
          notes: 'Updated from mobile',
          updated_at: new Date().toISOString()
        }
      };

      const response = await request(app)
        .put(`/api/mobile/wishlists/${testWishlist.wishlist_id}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.wishlist.metadata.notes).toBe('Updated from mobile');
    });

    it('should return 404 for non-existent wishlist', async () => {
      const updateData = {
        user_id: 'mobile-user-123',
        items: []
      };

      const response = await request(app)
        .put('/api/mobile/wishlists/00000000-0000-0000-0000-000000000000')
        .send(updateData);

      expect(response.status).toBe(404);
    });

    it('should reject update from different user', async () => {
      const updateData = {
        user_id: 'different-user-999',
        items: []
      };

      const response = await request(app)
        .put(`/api/mobile/wishlists/${testWishlist.wishlist_id}`)
        .send(updateData);

      expect(response.status).toBe(404);
    });

    it('should reject update without user_id', async () => {
      const updateData = {
        items: []
      };

      const response = await request(app)
        .put(`/api/mobile/wishlists/${testWishlist.wishlist_id}`)
        .send(updateData);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'user_id is required');
    });

    it('should reject update of non-active wishlist', async () => {
      await testWishlist.update({ status: 'COMPLETED' });

      const updateData = {
        user_id: 'mobile-user-123',
        items: []
      };

      const response = await request(app)
        .put(`/api/mobile/wishlists/${testWishlist.wishlist_id}`)
        .send(updateData);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Cannot update wishlist');
    });
  });

  describe('DELETE /api/mobile/wishlists/:wishlistId', () => {
    let testWishlist;

    beforeEach(async () => {
      testWishlist = await Wishlist.create({
        user_id: 'mobile-user-123',
        status: 'ACTIVE',
        source: 'MOBILE_APP',
        qr_code_token: 'token-123',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });
    });

    it('should delete a wishlist', async () => {
      const response = await request(app)
        .delete(`/api/mobile/wishlists/${testWishlist.wishlist_id}`)
        .query({ user_id: 'mobile-user-123' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');

      // Verify wishlist is cancelled
      const updatedWishlist = await Wishlist.findByPk(testWishlist.wishlist_id);
      expect(updatedWishlist.status).toBe('CANCELLED');
    });

    it('should return 404 for non-existent wishlist', async () => {
      const response = await request(app)
        .delete('/api/mobile/wishlists/00000000-0000-0000-0000-000000000000')
        .query({ user_id: 'mobile-user-123' });

      expect(response.status).toBe(404);
    });

    it('should reject deletion from different user', async () => {
      const response = await request(app)
        .delete(`/api/mobile/wishlists/${testWishlist.wishlist_id}`)
        .query({ user_id: 'different-user-999' });

      expect(response.status).toBe(404);
    });

    it('should reject deletion without user_id', async () => {
      const response = await request(app)
        .delete(`/api/mobile/wishlists/${testWishlist.wishlist_id}`);

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/mobile/wishlists/:wishlistId/qr', () => {
    let testWishlist;

    beforeEach(async () => {
      testWishlist = await Wishlist.create({
        user_id: 'mobile-user-123',
        status: 'ACTIVE',
        source: 'MOBILE_APP',
        qr_code_token: 'old-token-123',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });
    });

    it('should generate a new QR code', async () => {
      const response = await request(app)
        .post(`/api/mobile/wishlists/${testWishlist.wishlist_id}/qr`)
        .send({ user_id: 'mobile-user-123' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('qr_token');
      expect(response.body.qr_token).toBe('old-token-123');
      expect(response.body).toHaveProperty('qr_data');
      expect(response.body).toHaveProperty('expires_at');
    });

    it('should return 404 for non-existent wishlist', async () => {
      const response = await request(app)
        .post('/api/mobile/wishlists/00000000-0000-0000-0000-000000000000/qr')
        .send({ user_id: 'mobile-user-123' });

      expect(response.status).toBe(404);
    });

    it('should reject QR generation from different user', async () => {
      const response = await request(app)
        .post(`/api/mobile/wishlists/${testWishlist.wishlist_id}/qr`)
        .send({ user_id: 'different-user-999' });

      expect(response.status).toBe(404);
    });

    it('should reject QR generation without user_id', async () => {
      const response = await request(app)
        .post(`/api/mobile/wishlists/${testWishlist.wishlist_id}/qr`)
        .send({});

      expect(response.status).toBe(400);
    });
  });
});
