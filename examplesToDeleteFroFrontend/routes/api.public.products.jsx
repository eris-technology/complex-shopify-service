import { json } from "@remix-run/node";
import { corsHeaders } from "../utils/cors";
import { getCachedData, setCachedData, generateProductsCacheKey } from "../utils/redis";

export async function loader({ request }) {
  const url = new URL(request.url);
  
  // Handle CORS for public requests
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const first = url.searchParams.get("first") || "50"; // Increased from 20 to 50
    const after = url.searchParams.get("after");

    let variables = { first: parseInt(first) };

    if (after) {
      variables.after = after;
    }

    // For public requests, use Admin API with forced collection filtering for security
    console.log("Public request - using Admin API with forced collection filtering");
    // For public requests, force collection filtering for security
    // This ensures the kiosk only shows approved products regardless of frontend manipulation
    const forcedCollection = process.env.SHOPIFY_PUBLIC_COLLECTION || "jennie-popup";
    const allowedLocations = process.env.SHOPIFY_ALLOWED_LOCATIONS ? 
      process.env.SHOPIFY_ALLOWED_LOCATIONS.split(',').map(loc => loc.trim()) : 
      null;
    
    console.log(`Forcing collection filter for public requests: ${forcedCollection}`);
    if (allowedLocations) {
      console.log(`Filtering inventory by locations: ${allowedLocations.join(', ')}`);
    } else {
      console.log(`No location filter specified - showing all location inventory`);
    }

    // Check Redis cache first
    const cacheKey = generateProductsCacheKey(forcedCollection, variables.first, variables.after, allowedLocations);
    const cachedData = await getCachedData(cacheKey);
    
    if (cachedData) {
      console.log(`🚀 Returning cached products (key: ${cacheKey})`);
      return json(cachedData, { headers: corsHeaders });
    }
    
    // Create Admin API client using access token directly
    const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN;
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
    
    console.log(`🔧 Environment variables:`);
    console.log(`📍 Shop Domain: ${shopDomain}`);
    console.log(`🔑 Access Token: ${accessToken ? `${accessToken.substring(0, 10)}...` : 'MISSING'}`);
    
    // Try multiple API versions and endpoints
    const apiVersions = ['2024-01', '2023-10', '2023-07', '2023-04'];
    let adminApiUrl = null;
    let workingVersion = null;
    
    // Test different API versions
    for (const version of apiVersions) {
      const testUrl = `https://${shopDomain}/admin/api/${version}/graphql.json`;
      console.log(`🧪 Testing API version ${version}: ${testUrl}`);
      
      try {
        const testQuery = `#graphql
          query {
            shop {
              name
            }
          }
        `;
        
        const testResponse = await fetch(testUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": accessToken
          },
          body: JSON.stringify({
            query: testQuery
          })
        });
        
        console.log(`📊 API version ${version} response status: ${testResponse.status}`);
        
        if (testResponse.ok) {
          const testData = await testResponse.json();
          if (!testData.errors) {
            console.log(`✅ API version ${version} works! Shop name: ${testData.data?.shop?.name}`);
            adminApiUrl = testUrl;
            workingVersion = version;
            break;
          } else {
            console.log(`❌ API version ${version} has errors:`, testData.errors);
          }
        } else {
          const errorText = await testResponse.text();
          console.log(`❌ API version ${version} failed: ${testResponse.status} - ${errorText}`);
        }
      } catch (error) {
        console.log(`❌ API version ${version} error:`, error.message);
      }
    }
    
    if (!adminApiUrl) {
      console.error("❌ No working GraphQL API version found");
      
      // Try REST API as fallback to test basic connectivity
      console.log("� Testing REST API connectivity...");
      const restUrl = `https://${shopDomain}/admin/api/2024-01/shop.json`;
      
      try {
        const restResponse = await fetch(restUrl, {
          method: "GET",
          headers: {
            "X-Shopify-Access-Token": accessToken
          }
        });
        
        console.log(`📊 REST API response status: ${restResponse.status}`);
        if (restResponse.ok) {
          const restData = await restResponse.json();
          console.log(`✅ REST API works! Shop: ${restData.shop?.name}`);
          console.log("❌ But GraphQL API is not accessible - this might be a permissions issue");
        } else {
          const restError = await restResponse.text();
          console.log(`❌ REST API also failed: ${restResponse.status} - ${restError}`);
        }
      } catch (error) {
        console.log(`❌ REST API error:`, error.message);
      }
      
      return json({ 
        error: "GraphQL Admin API not accessible",
        message: "No working GraphQL API version found. This might be a permissions issue."
      }, { 
        status: 500,
        headers: corsHeaders
      });
    }
    
    console.log(`� Using working API version: ${workingVersion} - ${adminApiUrl}`);
    
    if (!accessToken) {
      console.error("Missing SHOPIFY_ACCESS_TOKEN environment variable");
      return json({ 
        error: "Configuration error",
        message: "Access token not configured"
      }, { 
        status: 500,
        headers: corsHeaders
      });
    }
    
    if (!shopDomain) {
      console.error("Missing SHOPIFY_SHOP_DOMAIN environment variable");
      return json({ 
        error: "Configuration error",
        message: "Shop domain not configured"
      }, { 
        status: 500,
        headers: corsHeaders
      });
    }
    
    if (!forcedCollection) {
      console.error("Missing SHOPIFY_PUBLIC_COLLECTION environment variable");
      return json({ 
        error: "Configuration error",
        message: "Public collection not configured"
      }, { 
        status: 500,
        headers: corsHeaders
      });
    }

    // Since other GraphQL queries work, let's skip collection lookup and directly query products
    // with collection filtering using the search syntax
    console.log(`� Directly querying products with collection filter: "${forcedCollection}"`);
    
    const graphqlQuery = `#graphql
      query getProducts($query: String, $after: String, $first: Int!) {
        products(first: $first, query: $query, after: $after) {
          edges {
            cursor
            node {
              id
              title
              handle
              description
              status
              totalInventory
              vendor
              productType
              tags
              variants(first: 10) {
                edges {
                  node {
                    id
                    title
                    sku
                    barcode
                    inventoryQuantity
                    price
                    compareAtPrice
                    image {
                      url
                      altText
                    }
                  }
                }
              }
              images(first: 5) {
                edges {
                  node {
                    url
                    altText
                  }
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;
    
    // Since collection filters in the products query don't seem to work properly,
    // let's go back to the proper approach: query the collection directly for its products
    console.log(`🔍 Querying collection "${forcedCollection}" directly for its products`);
    
    const collectionQuery = `#graphql
      query getCollectionProducts($handle: String!, $first: Int!, $after: String) {
        collectionByHandle(handle: $handle) {
          id
          title
          handle
          products(first: $first, after: $after) {
            edges {
              cursor
              node {
                id
                title
                handle
                description
                status
                totalInventory
                vendor
                productType
                tags
                metafields(first: 10) {
                  edges {
                    node {
                      id
                      key
                      value
                      namespace
                      type
                    }
                  }
                }
                variants(first: 10) {
                  edges {
                    node {
                      id
                      title
                      sku
                      barcode
                      inventoryQuantity
                      price
                      compareAtPrice
                      image {
                        url
                        altText
                      }
                      metafields(first: 10) {
                        edges {
                          node {
                            id
                            key
                            value
                            namespace
                            type
                          }
                        }
                      }
                      inventoryItem {
                        id
                        inventoryLevels(first: 10) {
                          edges {
                            node {
                              id
                              quantities(names: ["available"]) {
                                name
                                quantity
                              }
                              location {
                                id
                                name
                                address {
                                  city
                                  province
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
                images(first: 5) {
                  edges {
                    node {
                      url
                      altText
                    }
                  }
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    `;
    
    // Use collection handle directly
    variables.handle = forcedCollection;
    delete variables.query; // Remove the query parameter since we're not using products() search
    
    console.log(`📡 Making request to: ${adminApiUrl}`);
    console.log(`📋 Variables:`, JSON.stringify(variables, null, 2));

    const response = await fetch(adminApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken
      },
      body: JSON.stringify({
        query: collectionQuery,
        variables: variables
      })
    });

    console.log(`📊 Collection API response status: ${response.status}`);

    if (!response.ok) {
      const responseText = await response.text();
      console.error(`❌ Admin API request failed: ${response.status}`);
      console.error(`📄 Response body: ${responseText}`);
      throw new Error(`Admin API request failed: ${response.status} - ${responseText}`);
    }

    const data = await response.json();

    // Log GraphQL query cost information from Shopify
    if (data.extensions && data.extensions.cost) {
      const cost = data.extensions.cost;
      console.log(`💰 GraphQL Query Cost Information:`);
      console.log(`   🔋 Query Cost: ${cost.requestedQueryCost || 'N/A'}`);
      console.log(`   📊 Actual Query Cost: ${cost.actualQueryCost || 'N/A'}`);
      console.log(`   🏦 Available: ${cost.throttleStatus?.currentlyAvailable || 'N/A'}`);
      console.log(`   📈 Maximum Available: ${cost.throttleStatus?.maximumAvailable || 'N/A'}`);
      console.log(`   ⏱️  Restore Rate: ${cost.throttleStatus?.restoreRate || 'N/A'} per second`);
    } else {
      console.log(`💰 No cost information available in response extensions`);
    }

    if (data.errors) {
      console.error("Admin API errors:", data.errors);
      throw new Error("Admin API returned errors");
    }

    // Handle collection-based response
    let products, pageInfo;
    
    if (data.data.collectionByHandle) {
      const collection = data.data.collectionByHandle;
      products = collection.products;
      pageInfo = collection.products.pageInfo;
      
      console.log(`✅ Collection "${forcedCollection}" found!`);
      console.log(`📋 Collection ID: ${collection.id}`);
      console.log(`📋 Collection Title: ${collection.title}`);
      console.log(`📦 Products in collection: ${products.edges.length}`);
      console.log(`📄 Page info: hasNextPage=${pageInfo.hasNextPage}, endCursor=${pageInfo.endCursor}`);
      
      if (products.edges.length > 0) {
        console.log(`🛍️  First product: "${products.edges[0].node.title}" (ID: ${products.edges[0].node.id})`);
        console.log(`📋 First 3 products in "${forcedCollection}" collection:`);
        products.edges.slice(0, 3).forEach((edge, index) => {
          console.log(`  ${index + 1}. "${edge.node.title}" (ID: ${edge.node.id})`);
          console.log(`     Tags: [${edge.node.tags.join(', ')}]`);
          console.log(`     Vendor: ${edge.node.vendor}`);
        });
      } else {
        console.log(`⚠️  Collection "${forcedCollection}" exists but contains no products`);
      }
    } else {
      console.log(`❌ Collection "${forcedCollection}" not found`);
      return json({
        products: { edges: [] },
        pageInfo: { hasNextPage: false, endCursor: null },
        filters: {
          collection: forcedCollection,
          tags: null,
          query: null,
          note: "Collection not found"
        }
      }, {
        headers: corsHeaders
      });
    }

    // Transform Admin API response to match Storefront API format for frontend compatibility
    const transformedProducts = {
      edges: products.edges.map(edge => {
        // Extract metafields and find MaxPerOrder and BundleOnly
        const productMetafields = edge.node.metafields?.edges || [];
        
        console.log(`🔍 Product: ${edge.node.title} (ID: ${edge.node.id})`);
        console.log(`📊 Total metafields found: ${productMetafields.length}`);
        
        if (productMetafields.length > 0) {
          console.log(`📝 All metafields for "${edge.node.title}":`);
          productMetafields.forEach((mf, index) => {
            console.log(`  ${index + 1}. Key: "${mf.node.key}", Value: "${mf.node.value}", Namespace: "${mf.node.namespace}", Type: "${mf.node.type}"`);
          });
        }
        
        // Try multiple possible key variations for MaxPerOrder
        const possibleMaxPerOrderKeys = [
          'MaxPerOrder', 'maxPerOrder', 'max_per_order', 'MAX_PER_ORDER',
          'max-per-order', 'maxperorder', 'MAXPERORDER', 'Max Per Order',
          'max per order', 'maxQuantity', 'max_quantity', 'MaxQuantity'
        ];
        
        console.log(`🔍 Searching for MaxPerOrder with keys: ${possibleMaxPerOrderKeys.join(', ')}`);
        
        const maxPerOrderMetafield = productMetafields.find(mf => 
          possibleMaxPerOrderKeys.includes(mf.node.key)
        );
        
        // Try multiple possible key variations for BundleOnly
        const possibleBundleOnlyKeys = [
          'BundleOnly', 'bundleOnly', 'bundle_only', 'BUNDLE_ONLY',
          'bundle-only', 'bundleonly', 'BUNDLEONLY', 'Bundle Only',
          'bundle only', 'isBundle', 'is_bundle', 'IsBundle'
        ];
        
        console.log(`🔍 Searching for BundleOnly with keys: ${possibleBundleOnlyKeys.join(', ')}`);
        
        const bundleOnlyMetafield = productMetafields.find(mf => 
          possibleBundleOnlyKeys.includes(mf.node.key)
        );
        
        // Log specific metafield findings
        if (maxPerOrderMetafield) {
          console.log(`✅ MaxPerOrder found for "${edge.node.title}": Key="${maxPerOrderMetafield.node.key}", Value="${maxPerOrderMetafield.node.value}"`);
        } else {
          console.log(`❌ MaxPerOrder NOT found for "${edge.node.title}"`);
        }
        
        if (bundleOnlyMetafield) {
          console.log(`✅ BundleOnly found for "${edge.node.title}": Key="${bundleOnlyMetafield.node.key}", Value="${bundleOnlyMetafield.node.value}"`);
        } else {
          console.log(`❌ BundleOnly NOT found for "${edge.node.title}"`);
        }
        
        const finalMaxPerOrder = maxPerOrderMetafield ? parseInt(maxPerOrderMetafield.node.value) || null : null;
        const finalBundleOnly = bundleOnlyMetafield ? bundleOnlyMetafield.node.value === 'true' : false;
        
        // Log final transformed values
        console.log(`🔄 Final transformed values for "${edge.node.title}":`);
        console.log(`  maxPerOrder: ${finalMaxPerOrder} (type: ${typeof finalMaxPerOrder})`);
        console.log(`  bundleOnly: ${finalBundleOnly} (type: ${typeof finalBundleOnly})`);
        console.log(`---`);
        
        return {
          node: {
            id: edge.node.id,
            title: edge.node.title,
            handle: edge.node.handle,
            description: edge.node.description,
            availableForSale: edge.node.status === 'ACTIVE' && edge.node.totalInventory > 0,
            maxPerOrder: finalMaxPerOrder,
            bundleOnly: finalBundleOnly,
            metafields: productMetafields.map(mf => ({
              id: mf.node.id,
              key: mf.node.key,
              value: mf.node.value,
              namespace: mf.node.namespace,
              type: mf.node.type
            })),
            variants: {
              edges: edge.node.variants.edges.map(variantEdge => {
                const variant = variantEdge.node;
                
                // Extract variant metafields
                const variantMetafields = variant.metafields?.edges || [];
                const variantMaxPerOrderMetafield = variantMetafields.find(mf => 
                  mf.node.key === 'MaxPerOrder' || mf.node.key === 'maxPerOrder' || mf.node.key === 'max_per_order'
                );
                const variantBundleOnlyMetafield = variantMetafields.find(mf => 
                  mf.node.key === 'BundleOnly' || mf.node.key === 'bundleOnly' || mf.node.key === 'bundle_only'
                );
                
                // Calculate filtered inventory based on allowed locations
                let filteredInventory = variant.inventoryQuantity; // fallback to total
                let locationInventoryDetails = [];
                
                if (variant.inventoryItem && variant.inventoryItem.inventoryLevels) {
                  const inventoryLevels = variant.inventoryItem.inventoryLevels.edges;
                  
                  if (allowedLocations && allowedLocations.length > 0) {
                    // Filter by allowed locations
                    const filteredLevels = inventoryLevels.filter(level => 
                      allowedLocations.some(allowedLoc => 
                        level.node.location.name.toLowerCase().includes(allowedLoc.toLowerCase()) ||
                        level.node.location.id.includes(allowedLoc)
                      )
                    );
                    
                    filteredInventory = filteredLevels.reduce((total, level) => {
                      const availableQty = level.node.quantities?.find(q => q.name === 'available')?.quantity || 0;
                      return total + availableQty;
                    }, 0);
                    
                    locationInventoryDetails = filteredLevels.map(level => {
                      const availableQty = level.node.quantities?.find(q => q.name === 'available')?.quantity || 0;
                      return {
                        locationId: level.node.location.id,
                        locationName: level.node.location.name,
                        available: availableQty,
                        city: level.node.location.address?.city,
                        province: level.node.location.address?.province
                      };
                    });
                  } else {
                    // No location filter - use all locations
                    filteredInventory = inventoryLevels.reduce((total, level) => {
                      const availableQty = level.node.quantities?.find(q => q.name === 'available')?.quantity || 0;
                      return total + availableQty;
                    }, 0);
                    
                    locationInventoryDetails = inventoryLevels.map(level => {
                      const availableQty = level.node.quantities?.find(q => q.name === 'available')?.quantity || 0;
                      return {
                        locationId: level.node.location.id,
                        locationName: level.node.location.name,
                        available: availableQty,
                        city: level.node.location.address?.city,
                        province: level.node.location.address?.province
                      };
                    });
                  }
                }
                
                return {
                  node: {
                    id: variant.id,
                    title: variant.title,
                    price: {
                      amount: variant.price,
                      currencyCode: "USD" // You might want to make this configurable
                    },
                    barcode: variant.barcode,
                    availableForSale: filteredInventory > 0,
                    inventoryQuantity: filteredInventory,
                    locationInventory: locationInventoryDetails,
                    image: variant.image,
                    maxPerOrder: variantMaxPerOrderMetafield ? parseInt(variantMaxPerOrderMetafield.node.value) || null : null,
                    bundleOnly: variantBundleOnlyMetafield ? variantBundleOnlyMetafield.node.value === 'true' : false,
                    metafields: variantMetafields.map(mf => ({
                      id: mf.node.id,
                      key: mf.node.key,
                      value: mf.node.value,
                      namespace: mf.node.namespace,
                      type: mf.node.type
                    }))
                  }
                };
              })
            },
            images: edge.node.images,
            tags: edge.node.tags
          }
        };
      })
    };

    // Final summary log
    console.log(`📦 Final response: Returning ${transformedProducts.edges.length} products for public request`);
    
    // Log metafield information for debugging
    transformedProducts.edges.forEach((edge, index) => {
      const product = edge.node;
      if (product.maxPerOrder !== null) {
        console.log(`🏷️  Product "${product.title}" has MaxPerOrder: ${product.maxPerOrder}`);
      }
      if (product.bundleOnly) {
        console.log(`📦 Product "${product.title}" is BundleOnly: ${product.bundleOnly}`);
      }
      
      // Check variants for MaxPerOrder and BundleOnly as well
      product.variants.edges.forEach((variantEdge, vIndex) => {
        const variant = variantEdge.node;
        if (variant.maxPerOrder !== null) {
          console.log(`🏷️  Variant "${variant.title}" of "${product.title}" has MaxPerOrder: ${variant.maxPerOrder}`);
        }
        if (variant.bundleOnly) {
          console.log(`📦 Variant "${variant.title}" of "${product.title}" is BundleOnly: ${variant.bundleOnly}`);
        }
      });
      
      // Log first few metafields for debugging (only for first product)
      if (index === 0 && product.metafields.length > 0) {
        console.log(`🏷️  First product metafields:`);
        product.metafields.slice(0, 3).forEach(mf => {
          console.log(`     ${mf.namespace}.${mf.key}: ${mf.value} (${mf.type})`);
        });
      }
    });
    
    if (allowedLocations) {
      console.log(`📍 Location filtering applied for: ${allowedLocations.join(', ')}`);
      // Log first product's location inventory as example
      if (transformedProducts.edges.length > 0) {
        const firstProduct = transformedProducts.edges[0].node;
        if (firstProduct.variants.edges.length > 0) {
          const firstVariant = firstProduct.variants.edges[0].node;
          console.log(`📊 Example inventory for "${firstProduct.title}" - "${firstVariant.title}":`);
          console.log(`   Total filtered inventory: ${firstVariant.inventoryQuantity}`);
          if (firstVariant.locationInventory?.length > 0) {
            firstVariant.locationInventory.forEach(loc => {
              console.log(`   📍 ${loc.locationName}: ${loc.available} units (${loc.city}, ${loc.province})`);
            });
          }
        }
      }
    }

    const responseData = {
      products: transformedProducts,
      pageInfo: pageInfo,
      // Add metadata about the filtering applied (server-side forced)
      filters: {
        collection: forcedCollection,
        tags: null,
        query: null,
        note: "Collection filter enforced server-side for security"
      }
    };

    // Cache the response in Redis
    // Use shorter TTL for inventory-sensitive data
    const cacheTTL = allowedLocations ? 30 : 60; // 30s with inventory, 60s without
    await setCachedData(cacheKey, responseData, cacheTTL);

    return json(responseData, {
      headers: corsHeaders
    });

  } catch (error) {
    console.error("Error fetching products:", error);
    return json({ 
      error: "Failed to fetch products", 
      details: error.message 
    }, { 
      status: 500,
      headers: corsHeaders
    });
  }
}
