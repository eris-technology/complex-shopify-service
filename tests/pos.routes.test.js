const request = require('supertest');
const { app } = require('../index');
const { Wishlist, WishlistItem } = require('../models');
const { sequelize } = require('complex-common-utils');

describe('POS Routes', () => {

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

  describe('POST /api/pos/wishlists/fetch-by-qr', () => {
    let testWishlist;
    const validQRToken = 'valid-qr-token-456';

    beforeEach(async () => {
      testWishlist = await Wishlist.create({
        user_id: 'pos-user-456',
        status: 'ACTIVE',
        source: 'MOBILE_APP',
        qr_code_token: validQRToken,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });

      await WishlistItem.create({
        wishlist_id: testWishlist.wishlist_id,
        shopify_variant_id: 'var-2',
        shopify_product_id: 'prod-2',
        quantity: 1,
        product_title: 'QR Test Product',
        price: '50.00',
        currency: 'HKD'
      });
    });

    it('should fetch wishlist by QR token only', async () => {
      const response = await request(app)
        .post('/api/pos/wishlists/fetch-by-qr')
        .send({ qr_token: validQRToken });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('wishlist');
      expect(response.body).toHaveProperty('message', 'Wishlist ready for processing');
      expect(response.body.wishlist.wishlist_id).toBe(testWishlist.wishlist_id);
      expect(response.body.wishlist.status).toBe('PROCESSING');
      expect(response.body.wishlist.qr_code_used_at).toBeDefined();
      expect(response.body.wishlist.items).toHaveLength(1);
    });

    it('should reject request without qr_token', async () => {
      const response = await request(app)
        .post('/api/pos/wishlists/fetch-by-qr')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'qr_token is required');
    });

    it('should return 404 for non-existent QR token', async () => {
      const response = await request(app)
        .post('/api/pos/wishlists/fetch-by-qr')
        .send({ qr_token: 'non-existent-token' });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Wishlist not found');
    });

    it('should reject already used QR token', async () => {
      // First use
      await request(app)
        .post('/api/pos/wishlists/fetch-by-qr')
        .send({ qr_token: validQRToken });

      // Try to use again
      const response = await request(app)
        .post('/api/pos/wishlists/fetch-by-qr')
        .send({ qr_token: validQRToken });

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty('error', 'QR code has already been used');
      expect(response.body).toHaveProperty('used_at');
    });

    it('should reject expired wishlist QR token', async () => {
      const expiredWishlist = await Wishlist.create({
        user_id: 'pos-user-789',
        status: 'ACTIVE',
        source: 'MOBILE_APP',
        qr_code_token: 'expired-qr-token',
        expires_at: new Date(Date.now() - 1000)
      });

      const response = await request(app)
        .post('/api/pos/wishlists/fetch-by-qr')
        .send({ qr_token: 'expired-qr-token' });

      expect(response.status).toBe(410);
      expect(response.body).toHaveProperty('error', 'Wishlist has expired');
      expect(response.body).toHaveProperty('expired_at');
    });

    it('should reject non-active wishlist QR token', async () => {
      await testWishlist.update({ status: 'CANCELLED' });

      const response = await request(app)
        .post('/api/pos/wishlists/fetch-by-qr')
        .send({ qr_token: validQRToken });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('cannot be processed');
    });
  });

  describe('POST /api/pos/wishlists/:wishlistId/fetch', () => {
    let testWishlist;
    const validQRToken = 'valid-qr-token-123';

    beforeEach(async () => {
      testWishlist = await Wishlist.create({
        user_id: 'pos-user-123',
        status: 'ACTIVE',
        source: 'MOBILE_APP',
        qr_code_token: validQRToken,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });

      await WishlistItem.create({
        wishlist_id: testWishlist.wishlist_id,
        shopify_variant_id: 'var-1',
        shopify_product_id: 'prod-1',
        quantity: 2,
        product_title: 'Test Product',
        price: '25.00',
        currency: 'HKD'
      });
    });

    it('should fetch wishlist with valid QR token', async () => {
      const response = await request(app)
        .post(`/api/pos/wishlists/${testWishlist.wishlist_id}/fetch`)
        .send({ qr_token: validQRToken });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('wishlist');
      expect(response.body).toHaveProperty('message', 'Wishlist ready for processing');
      expect(response.body.wishlist.status).toBe('PROCESSING');
      expect(response.body.wishlist.qr_code_used_at).toBeDefined();
      expect(response.body.wishlist.items).toHaveLength(1);
    });

    it('should reject request without qr_token', async () => {
      const response = await request(app)
        .post(`/api/pos/wishlists/${testWishlist.wishlist_id}/fetch`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'qr_token is required');
    });

    it('should reject request with invalid QR token', async () => {
      const response = await request(app)
        .post(`/api/pos/wishlists/${testWishlist.wishlist_id}/fetch`)
        .send({ qr_token: 'invalid-token' });

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('error', 'Invalid QR code token');
    });

    it('should reject already used QR code', async () => {
      // First use the QR code
      await request(app)
        .post(`/api/pos/wishlists/${testWishlist.wishlist_id}/fetch`)
        .send({ qr_token: validQRToken });

      // Try to use it again
      const response = await request(app)
        .post(`/api/pos/wishlists/${testWishlist.wishlist_id}/fetch`)
        .send({ qr_token: validQRToken });

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty('error', 'QR code has already been used');
      expect(response.body).toHaveProperty('used_at');
    });

    it('should reject expired wishlist', async () => {
      // Create expired wishlist
      const expiredWishlist = await Wishlist.create({
        user_id: 'pos-user-456',
        status: 'ACTIVE',
        source: 'MOBILE_APP',
        qr_code_token: 'expired-token',
        expires_at: new Date(Date.now() - 1000) // Expired 1 second ago
      });

      const response = await request(app)
        .post(`/api/pos/wishlists/${expiredWishlist.wishlist_id}/fetch`)
        .send({ qr_token: 'expired-token' });

      expect(response.status).toBe(410);
      expect(response.body).toHaveProperty('error', 'Wishlist has expired');
      expect(response.body).toHaveProperty('expired_at');
    });

    it('should return 404 for non-existent wishlist', async () => {
      const response = await request(app)
        .post('/api/pos/wishlists/00000000-0000-0000-0000-000000000000/fetch')
        .send({ qr_token: validQRToken });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Wishlist not found');
    });

    it('should reject non-active wishlist', async () => {
      await testWishlist.update({ status: 'CANCELLED' });

      const response = await request(app)
        .post(`/api/pos/wishlists/${testWishlist.wishlist_id}/fetch`)
        .send({ qr_token: validQRToken });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('cannot be processed');
    });
  });

  describe('POST /api/pos/wishlists/:wishlistId/complete', () => {
    let testWishlist;

    beforeEach(async () => {
      testWishlist = await Wishlist.create({
        user_id: 'pos-user-123',
        status: 'PROCESSING',
        source: 'MOBILE_APP',
        qr_code_token: 'token-123',
        qr_code_used_at: new Date(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });
    });

    it('should complete a wishlist', async () => {
      const completeData = {
        processed_by: 'POS_USER_001',
        shopify_order_id: 'ORDER-12345'
      };

      const response = await request(app)
        .post(`/api/pos/wishlists/${testWishlist.wishlist_id}/complete`)
        .send(completeData);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Wishlist completed successfully');
      expect(response.body.wishlist.status).toBe('COMPLETED');
      expect(response.body.wishlist.processed_at).toBeDefined();
      expect(response.body.wishlist.processed_by).toBe('POS_USER_001');
      expect(response.body.wishlist.metadata.shopify_order_id).toBe('ORDER-12345');
    });

    it('should complete wishlist without optional fields', async () => {
      const response = await request(app)
        .post(`/api/pos/wishlists/${testWishlist.wishlist_id}/complete`)
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.wishlist.status).toBe('COMPLETED');
      expect(response.body.wishlist.processed_by).toBe('POS');
    });

    it('should return 404 for non-existent wishlist', async () => {
      const response = await request(app)
        .post('/api/pos/wishlists/00000000-0000-0000-0000-000000000000/complete')
        .send({});

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Wishlist not found');
    });

    it('should reject completion of non-processing wishlist', async () => {
      await testWishlist.update({ status: 'ACTIVE' });

      const response = await request(app)
        .post(`/api/pos/wishlists/${testWishlist.wishlist_id}/complete`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Cannot complete wishlist');
    });
  });

  describe('POST /api/pos/wishlists/:wishlistId/cancel', () => {
    let testWishlist;

    beforeEach(async () => {
      testWishlist = await Wishlist.create({
        user_id: 'pos-user-123',
        status: 'PROCESSING',
        source: 'MOBILE_APP',
        qr_code_token: 'token-123',
        qr_code_used_at: new Date(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });
    });

    it('should cancel a wishlist', async () => {
      const cancelData = {
        reason: 'Customer changed mind'
      };

      const response = await request(app)
        .post(`/api/pos/wishlists/${testWishlist.wishlist_id}/cancel`)
        .send(cancelData);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Wishlist cancelled successfully');
      expect(response.body.wishlist.status).toBe('CANCELLED');
      expect(response.body.wishlist.metadata.cancellation_reason).toBe('Customer changed mind');
    });

    it('should cancel wishlist without reason', async () => {
      const response = await request(app)
        .post(`/api/pos/wishlists/${testWishlist.wishlist_id}/cancel`)
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.wishlist.status).toBe('CANCELLED');
    });

    it('should return 404 for non-existent wishlist', async () => {
      const response = await request(app)
        .post('/api/pos/wishlists/00000000-0000-0000-0000-000000000000/cancel')
        .send({});

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Wishlist not found');
    });

    it('should allow cancellation of already completed wishlist', async () => {
      await testWishlist.update({ status: 'COMPLETED' });

      const response = await request(app)
        .post(`/api/pos/wishlists/${testWishlist.wishlist_id}/cancel`)
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.wishlist.status).toBe('CANCELLED');
    });

    it('should allow cancellation of already cancelled wishlist', async () => {
      await testWishlist.update({ status: 'CANCELLED' });

      const response = await request(app)
        .post(`/api/pos/wishlists/${testWishlist.wishlist_id}/cancel`)
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.wishlist.status).toBe('CANCELLED');
    });
  });

  describe('GET /api/pos/wishlists/:wishlistId/status', () => {
    let testWishlist;

    beforeEach(async () => {
      testWishlist = await Wishlist.create({
        user_id: 'pos-user-123',
        status: 'PROCESSING',
        source: 'MOBILE_APP',
        qr_code_token: 'token-123',
        qr_code_used_at: new Date(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });
    });

    it('should get wishlist status', async () => {
      const response = await request(app)
        .get(`/api/pos/wishlists/${testWishlist.wishlist_id}/status`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'PROCESSING');
      expect(response.body).toHaveProperty('qr_code_used', true);
      expect(response.body).toHaveProperty('expired', false);
      expect(response.body).toHaveProperty('processed', false);
    });

    it('should show expired status', async () => {
      const expiredWishlist = await Wishlist.create({
        user_id: 'pos-user-456',
        status: 'ACTIVE',
        source: 'MOBILE_APP',
        qr_code_token: 'expired-token',
        expires_at: new Date(Date.now() - 1000)
      });

      const response = await request(app)
        .get(`/api/pos/wishlists/${expiredWishlist.wishlist_id}/status`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('expired', true);
    });

    it('should show unused QR code status', async () => {
      const unusedWishlist = await Wishlist.create({
        user_id: 'pos-user-789',
        status: 'ACTIVE',
        source: 'MOBILE_APP',
        qr_code_token: 'unused-token',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });

      const response = await request(app)
        .get(`/api/pos/wishlists/${unusedWishlist.wishlist_id}/status`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('qr_code_used', false);
    });

    it('should return 404 for non-existent wishlist', async () => {
      const response = await request(app)
        .get('/api/pos/wishlists/00000000-0000-0000-0000-000000000000/status');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Wishlist not found');
    });
  });
});
