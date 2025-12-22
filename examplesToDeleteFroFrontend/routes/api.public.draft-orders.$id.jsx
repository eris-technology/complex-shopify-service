import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

// CORS headers for public requests
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Public-Request",
};

// Handle CORS preflight requests
export const options = async () => {
  return new Response(null, {
    status: 200,
    headers: corsHeaders
  });
};

export const loader = async ({ request, params }) => {
  try {
    const draftOrderId = params.id;
    
    if (!draftOrderId) {
      return json({ error: "Draft Order ID is required" }, { 
        status: 400,
        headers: corsHeaders
      });
    }

    console.log('Fetching draft order:', draftOrderId);

    // For public endpoint, try admin authentication directly
    // This works because we're within the app context
    const { admin } = await authenticate.admin(request);
    
    if (!admin) {
      return json({ 
        error: 'Authentication failed' 
      }, { 
        status: 401,
        headers: corsHeaders
      });
    }

    // GraphQL query to fetch draft order details
    const query = `
      query getDraftOrder($id: ID!) {
        draftOrder(id: $id) {
          id
          name
          email
          status
          note
          tags
          createdAt
          updatedAt
          customer {
            id
            displayName
            email
            phone
          }
          lineItems(first: 50) {
            edges {
              node {
                id
                title
                quantity
                originalUnitPriceSet {
                  presentmentMoney {
                    amount
                    currencyCode
                  }
                }
                variant {
                  id
                  sku
                  barcode
                }
                customAttributes {
                  key
                  value
                }
              }
            }
          }
          subtotalPriceSet {
            presentmentMoney {
              amount
              currencyCode
            }
          }
          totalPriceSet {
            presentmentMoney {
              amount
              currencyCode
            }
          }
        }
      }
    `;

    const variables = { id: draftOrderId };
    
    const response = await admin.graphql(query, { variables });
    const data = await response.json();

    // Log GraphQL query cost information from Shopify for draft order fetch
    if (data.extensions && data.extensions.cost) {
      const cost = data.extensions.cost;
      console.log(`💰 Draft Order Fetch - GraphQL Query Cost Information:`);
      console.log(`   🔋 Query Cost: ${cost.requestedQueryCost || 'N/A'}`);
      console.log(`   📊 Actual Query Cost: ${cost.actualQueryCost || 'N/A'}`);
      console.log(`   🏦 Available: ${cost.throttleStatus?.currentlyAvailable || 'N/A'}`);
      console.log(`   📈 Maximum Available: ${cost.throttleStatus?.maximumAvailable || 'N/A'}`);
      console.log(`   ⏱️  Restore Rate: ${cost.throttleStatus?.restoreRate || 'N/A'} per second`);
    } else {
      console.log(`💰 Draft Order Fetch - No cost information available in response extensions`);
    }

    if (data.errors) {
      console.error('GraphQL errors:', data.errors);
      return json({ error: 'Failed to fetch draft order', details: data.errors }, { 
        status: 500,
        headers: corsHeaders
      });
    }

    if (!data.data?.draftOrder) {
      return json({ error: 'Draft order not found' }, { 
        status: 404,
        headers: corsHeaders
      });
    }

    const draftOrder = data.data.draftOrder;

    // Transform the draft order data for the POS extension
    const transformedData = {
      id: draftOrder.id,
      name: draftOrder.name,
      email: draftOrder.email,
      status: draftOrder.status,
      note: draftOrder.note,
      tags: draftOrder.tags,
      createdAt: draftOrder.createdAt,
      updatedAt: draftOrder.updatedAt,
      customer: draftOrder.customer,
      lineItems: draftOrder.lineItems.edges.map(edge => ({
        id: edge.node.id,
        title: edge.node.title,
        quantity: edge.node.quantity,
        price: edge.node.originalUnitPriceSet?.presentmentMoney?.amount,
        currency: edge.node.originalUnitPriceSet?.presentmentMoney?.currencyCode,
        variantId: edge.node.variant?.id,
        sku: edge.node.variant?.sku,
        barcode: edge.node.variant?.barcode,
        customAttributes: edge.node.customAttributes
      })),
      subtotal: draftOrder.subtotalPriceSet?.presentmentMoney?.amount,
      total: draftOrder.totalPriceSet?.presentmentMoney?.amount,
      currency: draftOrder.totalPriceSet?.presentmentMoney?.currencyCode
    };

    console.log('Draft order fetched successfully:', transformedData.name);
    
    return json({
      success: true,
      draftOrder: transformedData
    }, {
      headers: corsHeaders
    });

  } catch (error) {
    console.error('Error fetching draft order:', error);
    return json({ 
      error: 'Internal server error', 
      message: error.message 
    }, { 
      status: 500,
      headers: corsHeaders
    });
  }
};
