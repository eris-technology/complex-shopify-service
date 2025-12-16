# Complex Shopify Service

Wishlist service for Shopify POS extensions and mobile app integration. Replaces the draft order hack with a proper database-backed wishlist system.

## Features

- **Wishlist Management**: Create, read, update, and delete wishlists
- **Product Catalog API**: Cached Shopify product queries for kiosk/mobile
- **Dual Cache Mode**: In-memory (testing) or Redis (production)
- **POS Integration**: Secure endpoints for Shopify POS extensions with QR code token validation
- **Mobile App Support**: JWT-authenticated endpoints for mobile app wishlist creation
- **One-Time QR Codes**: Prevents duplicate processing with token-based validation
- **Idempotency**: Built-in idempotency key support for safe retries
- **Expiration Management**: Automatic wishlist expiration handling
- **User Isolation**: Wishlists are linked to Salesforce user IDs

## Architecture

- **Framework**: Express.js
- **Database**: PostgreSQL (Sequelize ORM)
- **Authentication**: 
  - **POS Routes**: Protected with POS secret token (`x-pos-secret` header)
    - POS endpoints are internet-facing (Shopify POS extension)
    - Require `POS_SECRET_TOKEN` environment variable
  - **Mobile/Wishlist Routes**: Protected by BFF
    - BFF validates JWT tokens and passes user_id to this service
    - Service trusts requests from BFF (internal network only)
- **Common Utils**: Uses `complex-common-utils` for database initialization

## Installation

```bash
npm install
```

## Configuration

Copy `.env.example` to `.env` and configure:

```env
# Server
NODE_ENV=development
PORT=3000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=shopify_service
DB_USER=shopify_user
DB_PASSWORD=your_password

# Cache
CACHE_MODE=memory  # Use 'redis' for production
REDIS_URL=redis://localhost:6379

# Shopify
SHOPIFY_SHOP_DOMAIN=your-shop.myshopify.com
SHOPIFY_ACCESS_TOKEN=your_token
SHOPIFY_API_VERSION=2024-01

# Wishlist Configuration
WISHLIST_EXPIRATION_HOURS=24
MAX_ITEMS_PER_WISHLIST=50
```

## Database Setup

The service uses `complex-common-utils` for database initialization:

```bash
# Allow database modifications (only in dev/test)
AUTHORIZE_DB_MODIFICATIONS=true npm start
```

## Running the Service

```bash
# Development (with nodemon)
npm run dev

# Production
npm start

# Tests
npm test
```

## API Documentation

Once running, visit:
- Swagger UI: http://localhost:3000/api-docs
- Health Check: http://localhost:3000/health

## API Endpoints

### Product Catalog (for kiosk/mobile)
- `GET /api/products` - Get products (with caching)
- `GET /api/products/:id` - Get single product

### General Wishlist Operations
- `POST /api/wishlists` - Create wishlist
- `GET /api/wishlists/:id` - Get wishlist
- `GET /api/wishlists` - Search wishlists
- `PUT /api/wishlists/:id/items` - Update items
- `DELETE /api/wishlists/:id` - Cancel wishlist

### POS Extension Endpoints (requires `x-pos-secret` header)
- `POST /api/pos/wishlists/fetch-by-qr` - Fetch by QR token only (primary scan endpoint)
- `POST /api/pos/wishlists/:id/fetch` - Fetch for processing (validates QR token)
- `POST /api/pos/wishlists/:id/complete` - Mark as completed
- `POST /api/pos/wishlists/:id/cancel` - Cancel from POS
- `GET /api/pos/wishlists/:id/status` - Check status

### Mobile App Endpoints (called via BFF with user_id)
- `POST /api/mobile/wishlists` - Create wishlist (requires user_id in body)
- `GET /api/mobile/wishlists?user_id=xxx` - Get my wishlists
- `GET /api/mobile/wishlists/:id?user_id=xxx` - Get specific wishlist
- `PUT /api/mobile/wishlists/:id` - Update wishlist (requires user_id in body)
- `DELETE /api/mobile/wishlists/:id?user_id=xxx` - Delete wishlist
- `POST /api/mobile/wishlists/:id/qr` - Generate QR code (requires user_id in body)

## Database Models

### Wishlist
- Stores wishlist metadata
- Links to Salesforce user ID
- Contains QR token for one-time use
- Tracks status and expiration

### WishlistItem
- Individual products/variants in wishlist
- Stores complete product data snapshot
- Supports quantity tracking

### Idempotency
- Prevents duplicate operations
- Tracks idempotency keys
- Stores operation status

## Workflow

### 1. Create Wishlist (Mobile App via BFF)
```bash
POST /api/mobile/wishlists
{
  "user_id": "salesforce-user-id",  # Passed from BFF after JWT validation
  "items": [
    {
      "variant_id": "123456",
      "product_title": "T-Shirt",
      "quantity": 2,
      "price": 29.99
    }
  ]
}
```

### 2. Generate QR Code (Mobile App via BFF)
```bash
POST /api/mobile/wishlists/{id}/qr
{
  "user_id": "salesforce-user-id"  # Passed from BFF
}
# Returns QR token and data for QR code generation
```

### 3. Scan QR at POS (via BFF)
```bash
POST /api/pos/wishlists/{id}/fetch
{
  "qr_token": "token-from-qr-code"
}
# Validates token, marks as used, returns items
```

### 4. Complete at POS (via BFF)
```bash
POST /api/pos/wishlists/{id}/complete
{
  "processed_by": "staff-member",
  "shopify_order_id": "order-123"
}
```

## Security

- **BFF Layer**: All authentication/authorization handled by BFF
- **Internal Service**: This service trusts requests from BFF (should only be accessible internally)
- **QR Tokens**: One-time use, cryptographically secure
- **User Isolation**: Users can only access their own wishlists (enforced by user_id checks)
- **Idempotency**: Prevents duplicate processing

## Deployment Notes

- **Network**: Should be deployed in private network, only accessible by BFF
- **No Public Exposure**: Do NOT expose this service directly to the internet
- **BFF Gateway**: All external requests must go through BFF for authentication

### Testing

```bash
npm test
```

## Deployment

1. Set production environment variables
2. Run database migrations: `AUTHORIZE_DB_MODIFICATIONS=true npm start` (first time only)
3. Deploy to ECS/container service
4. Configure load balancer and SSL

## License

ISC
