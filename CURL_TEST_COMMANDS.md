# CURL Test Commands for Shopify Service

Server running at: `http://localhost:3000`

## 1. Products Routes

### Get Products (all)
```bash
curl -X GET "http://localhost:3000/api/products" -H "Content-Type: application/json"
```

### Get Products (with collection filter)
```bash
curl -X GET "http://localhost:3000/api/products?collection=popup&limit=10" -H "Content-Type: application/json"
```

### Get Products (with pagination)
```bash
curl -X GET "http://localhost:3000/api/products?limit=5" -H "Content-Type: application/json"
```

### Get Single Product by ID
```bash
# Replace with actual product ID from the GET products response
curl -X GET "http://localhost:3000/api/products/YOUR_PRODUCT_ID" -H "Content-Type: application/json"
```

---

## 2. Wishlist Routes (General)

### Create Wishlist
```bash
curl -X POST "http://localhost:3000/api/wishlists" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test-user-001",
    "source": "KIOSK",
    "items": [
      {
        "variant_id": "gid://shopify/ProductVariant/48796852347184",
        "product_id": "gid://shopify/Product/9665518674224",
        "quantity": 2,
        "product_title": "Moretti Beer",
        "variant_title": "6 Pack",
        "price": "15.99",
        "currency": "HKD",
        "barcode": "8001440091445"
      }
    ],
    "metadata": {
      "kiosk_id": "KIOSK-001",
      "location": "Store A"
    }
  }'
```

### Get Wishlist by ID
```bash
# Replace WISHLIST_ID with actual ID from create response
curl -X GET "http://localhost:3000/api/wishlists/WISHLIST_ID" -H "Content-Type: application/json"
```

### Search Wishlists
```bash
curl -X GET "http://localhost:3000/api/wishlists?user_id=test-user-001&status=ACTIVE" -H "Content-Type: application/json"
```

### Update Wishlist Items
```bash
# Replace WISHLIST_ID with actual ID
curl -X PUT "http://localhost:3000/api/wishlists/WISHLIST_ID/items" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "variant_id": "gid://shopify/ProductVariant/48796852347184",
        "product_id": "gid://shopify/Product/9665518674224",
        "quantity": 5,
        "product_title": "Updated Product",
        "price": "20.00",
        "currency": "HKD"
      }
    ]
  }'
```

### Cancel Wishlist
```bash
# Replace WISHLIST_ID with actual ID
curl -X DELETE "http://localhost:3000/api/wishlists/WISHLIST_ID" -H "Content-Type: application/json"
```

### Expire Wishlist
```bash
# Replace WISHLIST_ID with actual ID
curl -X POST "http://localhost:3000/api/wishlists/WISHLIST_ID/expire" -H "Content-Type: application/json"
```

---

## 3. Mobile Routes

### Create Wishlist (Mobile)
```bash
curl -X POST "http://localhost:3000/api/mobile/wishlists" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "mobile-user-001",
    "items": [
      {
        "variant_id": "gid://shopify/ProductVariant/48796852347184",
        "product_id": "gid://shopify/Product/9665518674224",
        "quantity": 1,
        "product_title": "Moretti Beer",
        "variant_title": "6 Pack",
        "price": "15.99",
        "currency": "HKD"
      }
    ],
    "metadata": {
      "device_type": "iOS",
      "app_version": "2.0.1"
    }
  }'
```

### Get My Wishlists
```bash
curl -X GET "http://localhost:3000/api/mobile/wishlists?user_id=mobile-user-001" -H "Content-Type: application/json"
```

### Get Specific Wishlist
```bash
# Replace WISHLIST_ID with actual ID
curl -X GET "http://localhost:3000/api/mobile/wishlists/WISHLIST_ID?user_id=mobile-user-001" -H "Content-Type: application/json"
```

### Update Wishlist
```bash
# Replace WISHLIST_ID with actual ID
curl -X PUT "http://localhost:3000/api/mobile/wishlists/WISHLIST_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "mobile-user-001",
    "items": [
      {
        "variant_id": "gid://shopify/ProductVariant/48796852347184",
        "product_id": "gid://shopify/Product/9665518674224",
        "quantity": 3,
        "product_title": "Updated Product",
        "price": "25.00",
        "currency": "HKD"
      }
    ]
  }'
```

### Delete Wishlist
```bash
# Replace WISHLIST_ID with actual ID
curl -X DELETE "http://localhost:3000/api/mobile/wishlists/WISHLIST_ID?user_id=mobile-user-001" -H "Content-Type: application/json"
```

### Generate QR Code
```bash
# Replace WISHLIST_ID with actual ID
curl -X POST "http://localhost:3000/api/mobile/wishlists/WISHLIST_ID/qr" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "mobile-user-001"
  }'
```

---

## 4. POS Routes

### Fetch Wishlist (with QR Token)
```bash
# Replace WISHLIST_ID and QR_TOKEN with actual values from create/qr response
curl -X POST "http://localhost:3000/api/pos/wishlists/WISHLIST_ID/fetch" \
  -H "Content-Type: application/json" \
  -d '{
    "qr_token": "YOUR_QR_TOKEN_HERE"
  }'
```

### Complete Wishlist
```bash
# Replace WISHLIST_ID with actual ID (must be in PROCESSING state)
curl -X POST "http://localhost:3000/api/pos/wishlists/WISHLIST_ID/complete" \
  -H "Content-Type: application/json" \
  -d '{
    "processed_by": "POS_USER_001",
    "shopify_order_id": "ORDER-12345"
  }'
```

### Cancel Wishlist (POS)
```bash
# Replace WISHLIST_ID with actual ID
curl -X POST "http://localhost:3000/api/pos/wishlists/WISHLIST_ID/cancel" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Customer changed mind"
  }'
```

### Get Wishlist Status
```bash
# Replace WISHLIST_ID with actual ID
curl -X GET "http://localhost:3000/api/pos/wishlists/WISHLIST_ID/status" -H "Content-Type: application/json"
```

---

## Complete Test Flow Example

### Step 1: Get Products from Shopify
```bash
curl -X GET "http://localhost:3000/api/products?limit=5" -H "Content-Type: application/json"
```

### Step 2: Create Wishlist with Real Product Data
```bash
curl -X POST "http://localhost:3000/api/mobile/wishlists" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "flow-test-user",
    "items": [
      {
        "variant_id": "COPY_FROM_STEP1",
        "product_id": "COPY_FROM_STEP1",
        "quantity": 1,
        "product_title": "COPY_FROM_STEP1",
        "price": "COPY_FROM_STEP1",
        "currency": "HKD"
      }
    ]
  }'
```
**Save the `wishlist_id` and `qr_code_token` from response**

### Step 3: Retrieve Wishlist
```bash
curl -X GET "http://localhost:3000/api/mobile/wishlists/WISHLIST_ID?user_id=flow-test-user"
```

### Step 4: Generate QR Code
```bash
curl -X POST "http://localhost:3000/api/mobile/wishlists/WISHLIST_ID/qr" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "flow-test-user"}'
```

### Step 5: Fetch for POS Processing
```bash
curl -X POST "http://localhost:3000/api/pos/wishlists/WISHLIST_ID/fetch" \
  -H "Content-Type: application/json" \
  -d '{"qr_token": "QR_TOKEN_FROM_STEP2_OR_4"}'
```

### Step 6: Check Status
```bash
curl -X GET "http://localhost:3000/api/pos/wishlists/WISHLIST_ID/status"
```

### Step 7: Complete or Cancel
```bash
# Option A: Complete
curl -X POST "http://localhost:3000/api/pos/wishlists/WISHLIST_ID/complete" \
  -H "Content-Type: application/json" \
  -d '{"processed_by": "POS_USER", "shopify_order_id": "ORD-123"}'

# Option B: Cancel
curl -X POST "http://localhost:3000/api/pos/wishlists/WISHLIST_ID/cancel" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Test cancellation"}'
```

---

## Health Check
```bash
curl -X GET "http://localhost:3000/health"
```

## API Documentation
Open in browser: http://localhost:3000/api-docs

---

## Notes
- Server is running with **real Shopify integration** (morettiproducts.myshopify.com)
- Replace placeholder values (WISHLIST_ID, QR_TOKEN, etc.) with actual values from responses
- All responses are in JSON format
- Use `-v` flag for verbose output: `curl -v ...`
- Use `| jq` for pretty JSON: `curl ... | jq`
