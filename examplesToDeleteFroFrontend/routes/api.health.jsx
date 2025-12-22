import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  try {
    console.log("Health check: Starting...");
    
    // Check if we're being called from within the app or externally
    const url = new URL(request.url);
    const referer = request.headers.get('referer');
    const userAgent = request.headers.get('user-agent');
    
    console.log("Health check: Request details", {
      referer,
      userAgent,
      url: url.toString()
    });
    
    // More robust detection - check if it's coming from the app context
    const isFromApp = referer && (
      referer.includes('shopify.com') || 
      referer.includes('admin.shopify.com') ||
      referer.includes('partners.shopify.com') ||
      referer.includes('/app') ||
      referer.includes('ngrok.io') ||
      referer.includes('localhost')
    );
    
    if (!isFromApp) {
      // Public health check - no authentication required
      console.log("Health check: Public endpoint access (no auth required)");
      return json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        mode: "public",
        apiVersion: "2024-01",
        debug: {
          referer,
          userAgent,
          isFromApp
        },
        endpoints: {
          storefront: {
            products: "/api/storefront/products"
          },
          admin: {
            products: "/api/admin/products",
            productVariants: "/api/admin/product-variants",
            customers: "/api/admin/customers",
            draftOrders: "/api/admin/draft-orders"
          }
        },
        connection: {
          serverRunning: true,
          authenticated: false,
          note: "This is a public health check. For authenticated checks, access from within the Shopify app."
        }
      });
    }
    
    // Authenticated health check
    console.log("Health check: Starting authentication...");
    
    // Verify authentication
    const { admin, session } = await authenticate.admin(request);
    
    console.log("Health check: Authentication successful", {
      shop: session.shop,
      hasAdmin: !!admin
    });
    
    // Test a simple GraphQL query to verify the connection works
    console.log("Health check: Testing GraphQL query...");
    const testQuery = await admin.graphql(
      `#graphql
        query {
          shop {
            name
            email
            myshopifyDomain
          }
        }
      `
    );
    
    console.log("Health check: GraphQL query completed, parsing response...");
    const testData = await testQuery.json();
    
    console.log("Health check: GraphQL response:", testData);
    
    if (testData.errors) {
      throw new Error(`GraphQL Error: ${testData.errors[0].message}`);
    }
    
    console.log("Health check: All checks passed, returning healthy status");
    
    return json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      mode: "authenticated",
      shop: {
        name: testData.data.shop.name,
        domain: testData.data.shop.myshopifyDomain,
        email: testData.data.shop.email
      },
      sessionShop: session.shop,
      apiVersion: "2024-01",
      endpoints: {
        storefront: {
          products: "/api/storefront/products"
        },
        admin: {
          products: "/api/admin/products",
          productVariants: "/api/admin/product-variants",
          customers: "/api/admin/customers",
          draftOrders: "/api/admin/draft-orders"
        }
      },
      connection: {
        authenticated: true,
        graphqlWorking: true
      }
    });
  } catch (error) {
    console.error("Health check error:", error);
    
    // Check if the error is a Response object (common in Remix apps)
    if (error instanceof Response) {
      console.error("Authentication failed - Response object thrown");
      
      // Try to get response details
      const responseDetails = {
        status: error.status,
        statusText: error.statusText,
        url: error.url,
        redirected: error.redirected,
        type: error.type,
        headers: {}
      };
      
      // Get headers
      for (const [key, value] of error.headers.entries()) {
        responseDetails.headers[key] = value;
      }
      
      // Try to get response body if possible
      let responseBody = null;
      try {
        responseBody = await error.clone().text();
      } catch (bodyError) {
        responseBody = "Could not read response body";
      }
      
      return json({
        status: "unhealthy",
        error: `Authentication failed - HTTP ${error.status} ${error.statusText}`,
        errorName: "AuthenticationError",
        errorStack: "Authentication response thrown (likely redirect or unauthorized)",
        timestamp: new Date().toISOString(),
        details: {
          type: "Response",
          constructor: "Response",
          response: responseDetails,
          body: responseBody,
          isAuthenticationFailure: true,
          message: "The health check failed during authentication. This usually means the app is not properly installed or authenticated with the Shopify store."
        }
      }, { status: 500 });
    }
    
    // Handle regular Error objects
    console.error("Error details:", {
      message: error.message,
      name: error.name,
      stack: error.stack,
      cause: error.cause,
      code: error.code,
      statusCode: error.statusCode
    });
    
    // Get all enumerable properties from the error
    const errorDetails = {};
    for (const key in error) {
      if (error.hasOwnProperty(key)) {
        errorDetails[key] = error[key];
      }
    }
    
    return json({
      status: "unhealthy",
      error: error.message || error.toString() || "Unknown error",
      errorName: error.name || error.constructor.name || "Error",
      errorStack: error.stack || "No stack trace available",
      timestamp: new Date().toISOString(),
      details: {
        message: error.message,
        name: error.name,
        cause: error.cause?.toString(),
        code: error.code,
        statusCode: error.statusCode,
        type: typeof error,
        constructor: error.constructor.name,
        allProperties: errorDetails,
        // Try to get more info about the error
        ...(error.response && { response: error.response }),
        ...(error.request && { request: error.request }),
        ...(error.config && { config: error.config })
      }
    }, { status: 500 });
  }
}
