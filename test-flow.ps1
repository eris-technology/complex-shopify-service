# Complete Shopify Service Test Script
# Run these commands in sequence

Write-Host "`n=== 1. Health Check ===" -ForegroundColor Green
curl http://localhost:3000/health | ConvertFrom-Json | ConvertTo-Json

Write-Host "`n=== 2. Get Products from Shopify ===" -ForegroundColor Green
$products = curl "http://localhost:3000/api/products?limit=3" | ConvertFrom-Json
$products | ConvertTo-Json -Depth 10

Write-Host "`n=== 3. Create Wishlist ===" -ForegroundColor Green
$wishlistResponse = curl -X POST "http://localhost:3000/api/wishlists" -H "Content-Type: application/json" -d "@test-wishlist.json" | ConvertFrom-Json
$wishlistId = $wishlistResponse.wishlist.wishlist_id
$qrToken = $wishlistResponse.qr_code_token
Write-Host "Created Wishlist ID: $wishlistId" -ForegroundColor Yellow
Write-Host "QR Token: $qrToken" -ForegroundColor Yellow
$wishlistResponse | ConvertTo-Json -Depth 10

Write-Host "`n=== 4. Get Wishlist by ID ===" -ForegroundColor Green
curl "http://localhost:3000/api/wishlists/$wishlistId" | ConvertFrom-Json | ConvertTo-Json -Depth 10

Write-Host "`n=== 5. Get Wishlist Status ===" -ForegroundColor Green
curl "http://localhost:3000/api/pos/wishlists/$wishlistId/status" | ConvertFrom-Json | ConvertTo-Json

Write-Host "`n=== 6. Fetch Wishlist at POS (QR Scan) ===" -ForegroundColor Green
$fetchBody = @{qr_token = $qrToken} | ConvertTo-Json
$fetchResponse = curl -X POST "http://localhost:3000/api/pos/wishlists/$wishlistId/fetch" -H "Content-Type: application/json" -d $fetchBody | ConvertFrom-Json
$fetchResponse | ConvertTo-Json -Depth 10

Write-Host "`n=== 7. Check Status (Should be PROCESSING) ===" -ForegroundColor Green
curl "http://localhost:3000/api/pos/wishlists/$wishlistId/status" | ConvertFrom-Json | ConvertTo-Json

Write-Host "`n=== 8. Complete Wishlist ===" -ForegroundColor Green
$completeBody = @{
    processed_by = "POS_USER_001"
    shopify_order_id = "ORDER-TEST-12345"
} | ConvertTo-Json
curl -X POST "http://localhost:3000/api/pos/wishlists/$wishlistId/complete" -H "Content-Type: application/json" -d $completeBody | ConvertFrom-Json | ConvertTo-Json -Depth 10

Write-Host "`n=== 9. Final Status (Should be COMPLETED) ===" -ForegroundColor Green
curl "http://localhost:3000/api/pos/wishlists/$wishlistId/status" | ConvertFrom-Json | ConvertTo-Json

Write-Host "`n=== TEST COMPLETE ===" -ForegroundColor Green
