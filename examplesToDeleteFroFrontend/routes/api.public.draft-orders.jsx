import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

// CORS headers for public requests
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Public-Request",
};

export async function action({ request }) {
  // Handle CORS for public requests
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { 
      status: 405,
      headers: corsHeaders
    });
  }

  try {
    const body = await request.json();
    const { customer, products, lineItems, note, tags, source } = body;
    const publicRequest = request.headers.get('X-Public-Request');
    
    console.log("Creating draft order with data:", { customer, products, lineItems, note, tags, source });

    // Initialize admin object first
    let admin;
    
    if (publicRequest === 'true') {
      // For public requests, use direct API calls with access token
      console.log("Public draft order creation request");
      
      // Get environment variables
      const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN;
      const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
      
      if (!accessToken) {
        console.error("Missing SHOPIFY_ACCESS_TOKEN environment variable");
        return json({ 
          error: "Configuration error",
          message: "Server configuration missing for public requests"
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
      
      // Create a mock admin object for direct API calls
      admin = {
        graphql: async (query, options = {}) => {
          const url = `https://${shopDomain}/admin/api/2024-01/graphql.json`;
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': accessToken,
            },
            body: JSON.stringify({
              query: query,
              variables: options.variables || {}
            })
          });
          
          return {
            json: async () => await response.json()
          };
        }
      };
    } else {
      // For authenticated requests, use the standard authentication
      console.log("Authenticated draft order creation request");
      const { admin: authenticatedAdmin } = await authenticate.admin(request);
      admin = authenticatedAdmin;
    }

    let finalCustomerId;
    let finalLineItems = lineItems;
    
    // Handle customer ID if provided
    if (customer && customer.customerId) {
      console.log("Using existing customer ID:", customer.customerId);
      finalCustomerId = customer.customerId.startsWith('gid://shopify/Customer/') 
        ? customer.customerId 
        : `gid://shopify/Customer/${customer.customerId}`;
    }
    // Create customer first if customer data is provided but no ID
    else if (customer && (!customer.customerId)) {
      console.log("Creating customer:", customer);
      
      const customerCreateResponse = await admin.graphql(
        `mutation customerCreate($input: CustomerInput!) {
  customerCreate(input: $input) {
    customer {
      id
      email
      firstName
      lastName
      phone
      createdAt
    }
    userErrors {
      field
      message
    }
  }
}`,
        { variables: { input: customer } }
      );
      // Defensive: Check for missing or malformed customerCreate response
      const customerData = await customerCreateResponse.json();
      
      // Log GraphQL query cost information from Shopify for customer creation in draft orders
      if (customerData.extensions && customerData.extensions.cost) {
        const cost = customerData.extensions.cost;
        console.log(`💰 Draft Order - Customer Creation - GraphQL Query Cost Information:`);
        console.log(`   🔋 Query Cost: ${cost.requestedQueryCost || 'N/A'}`);
        console.log(`   📊 Actual Query Cost: ${cost.actualQueryCost || 'N/A'}`);
        console.log(`   🏦 Available: ${cost.throttleStatus?.currentlyAvailable || 'N/A'}`);
        console.log(`   📈 Maximum Available: ${cost.throttleStatus?.maximumAvailable || 'N/A'}`);
        console.log(`   ⏱️  Restore Rate: ${cost.throttleStatus?.restoreRate || 'N/A'} per second`);
      } else {
        console.log(`💰 Draft Order - Customer Creation - No cost information available in response extensions`);
      }
      
      if (!customerData.data || !customerData.data.customerCreate) {
        console.error("Shopify API error: customerCreate missing in response", customerData);
        return json({
          error: "Shopify API error: customerCreate missing in response",
          details: customerData
        }, {
          status: 502,
          headers: corsHeaders
        });
      }

      if (customerData.data.customerCreate.userErrors && customerData.data.customerCreate.userErrors.length > 0) {
        const errors = customerData.data.customerCreate.userErrors;
        console.error("Customer creation errors:", errors);
        // Check if customer already exists
        const emailExistsError = errors.find(error =>
          error.field?.includes('email') &&
          (error.message?.toLowerCase().includes('taken') ||
           error.message?.toLowerCase().includes('exists'))
        );
        if (emailExistsError) {
          console.log("Customer already exists, searching for existing customer...");
          // Search for existing customer by email
          const searchResponse = await admin.graphql(
            `query getCustomers($query: String!) {
  customers(first: 1, query: $query) {
    edges {
      node {
        id
        email
        firstName
        lastName
        phone
        createdAt
        updatedAt
      }
    }
  }
}`,
            { variables: { query: `email:${customer.email}` } }
          );
          const searchData = await searchResponse.json();
          
          // Log GraphQL query cost information from Shopify for customer search in draft orders
          if (searchData.extensions && searchData.extensions.cost) {
            const cost = searchData.extensions.cost;
            console.log(`💰 Draft Order - Customer Search - GraphQL Query Cost Information:`);
            console.log(`   🔋 Query Cost: ${cost.requestedQueryCost || 'N/A'}`);
            console.log(`   📊 Actual Query Cost: ${cost.actualQueryCost || 'N/A'}`);
            console.log(`   🏦 Available: ${cost.throttleStatus?.currentlyAvailable || 'N/A'}`);
            console.log(`   📈 Maximum Available: ${cost.throttleStatus?.maximumAvailable || 'N/A'}`);
            console.log(`   ⏱️  Restore Rate: ${cost.throttleStatus?.restoreRate || 'N/A'} per second`);
          } else {
            console.log(`💰 Draft Order - Customer Search - No cost information available in response extensions`);
          }
          
          if (searchData.data?.customers?.edges?.length > 0) {
            const existingCustomer = searchData.data.customers.edges[0].node;
            console.log("Found existing customer:", existingCustomer);
            finalCustomerId = existingCustomer.id;
          } else {
            return json({
              error: "Customer with this email already exists but could not be found",
              details: errors
            }, {
              status: 400,
              headers: corsHeaders
            });
        }
      }
    }
          }
    if (products && Array.isArray(products) && !lineItems) {
      finalLineItems = products.map(product => ({
        variantId: product.id || product.variantId,
        quantity: product.quantity || 1
      }));
    }
    
    // Use existing lineItems if provided
    if (!finalLineItems) {
      finalLineItems = lineItems;
    }

    if (!finalLineItems || !Array.isArray(finalLineItems) || finalLineItems.length === 0) {
      return json({ 
        error: "Line items or products are required" 
      }, { 
        status: 400,
        headers: corsHeaders
      });
    }

    // Transform line items to the expected format
    const transformedLineItems = finalLineItems.map(item => ({
      variantId: item.variantId || item.id,
      quantity: item.quantity || 1,
      customAttributes: item.customAttributes || []
    }));

    // Build the draft order input
    const draftOrderInput = {
      lineItems: transformedLineItems,
      note: note || (source ? `Created from ${source}` : "Created from kiosk"),
      tags: tags || (source ? [source] : ["kiosk"]),
      useCustomerDefaultAddress: true
    };

    // Add customer if provided
    if (finalCustomerId) {
      draftOrderInput.customerId = finalCustomerId;
    }

    console.log("Creating draft order with input:", draftOrderInput);

    // Create the draft order using GraphQL Admin API
    const draftOrderMutation = `
      mutation draftOrderCreate($input: DraftOrderInput!) {
  draftOrderCreate(input: $input) {
    draftOrder {
      id
      name
      status
      createdAt
      updatedAt
      totalPriceSet {
        presentmentMoney {
          amount
          currencyCode
        }
      }
      customer {
        id
        displayName
        email
      }
      lineItems(first: 50) {
        edges {
          node {
            id
            quantity
            title
          }
        }
      }
    }
    userErrors {
      field
      message
    }
  }
}
`;

    // Call the Shopify Admin API to create the draft order
    const draftOrderResponse = await admin.graphql(
      draftOrderMutation,
      { variables: { input: draftOrderInput } }
    );

    const draftOrderResult = await draftOrderResponse.json();
    
    // Log GraphQL query cost information from Shopify for draft order creation
    if (draftOrderResult.extensions && draftOrderResult.extensions.cost) {
      const cost = draftOrderResult.extensions.cost;
      console.log(`💰 Draft Order Creation - GraphQL Query Cost Information:`);
      console.log(`   🔋 Query Cost: ${cost.requestedQueryCost || 'N/A'}`);
      console.log(`   📊 Actual Query Cost: ${cost.actualQueryCost || 'N/A'}`);
      console.log(`   🏦 Available: ${cost.throttleStatus?.currentlyAvailable || 'N/A'}`);
      console.log(`   📈 Maximum Available: ${cost.throttleStatus?.maximumAvailable || 'N/A'}`);
      console.log(`   ⏱️  Restore Rate: ${cost.throttleStatus?.restoreRate || 'N/A'} per second`);
    } else {
      console.log(`💰 Draft Order Creation - No cost information available in response extensions`);
    }
    
    // Debug: Log the full response to understand the structure
    console.log("Full draft order response:", JSON.stringify(draftOrderResult, null, 2));

    if (draftOrderResult.data?.draftOrderCreate?.userErrors?.length > 0) {
      const errors = draftOrderResult.data.draftOrderCreate.userErrors;
      console.error("Draft order creation errors:", errors);
      return json({ 
        error: "Failed to create draft order", 
        details: errors 
      }, { 
        status: 400,
        headers: corsHeaders
      });
    }

    if (!draftOrderResult.data?.draftOrderCreate?.draftOrder) {
      console.error("Draft order creation failed: No draft order returned");
      return json({ 
        error: "Failed to create draft order", 
        details: "No draft order data returned from Shopify"
      }, { 
        status: 500,
        headers: corsHeaders
      });
    }

    const draftOrder = draftOrderResult.data.draftOrderCreate.draftOrder;
    console.log("Draft order created successfully:", draftOrder.name);

    // Return the draft order data
    return json({
      success: true,
      draftOrder: {
        id: draftOrder.id,
        name: draftOrder.name,
        status: draftOrder.status,
        totalPrice: draftOrder.totalPriceSet?.presentmentMoney?.amount,
        currency: draftOrder.totalPriceSet?.presentmentMoney?.currencyCode,
        customer: draftOrder.customer,
        lineItems: draftOrder.lineItems?.edges?.map(edge => edge.node) || []
      },
      message: "Draft order created successfully!"
    }, {
      headers: corsHeaders
    });

  } catch (error) {
    console.error("Error creating draft order:", error);
    return json({ 
      error: "Internal server error", 
      details: error.message 
    }, { 
      status: 500,
      headers: corsHeaders
    });
  }
}
