import { json } from "@remix-run/node";

export async function loader({ request }) {
  try {
    // Public health check - no authentication required
    return json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      mode: "public",
      server: {
        running: true,
        environment: process.env.NODE_ENV || "development",
        nodeVersion: process.version
      },
      apiVersion: "2024-01",
      endpoints: {
        public: {
          products: "/api/public/products",
          customers: "/api/public/customers",
          draftOrders: "/api/public/draft-orders",
          draftOrderById: "/api/public/draft-orders/:id"
        },
        system: {
          health: "/api/health",
          status: "/api/status"
        }
      },
      authentication: {
        required: false,
        type: "Public Access",
        note: "Most API endpoints are publicly accessible for kiosk and client applications. Health endpoint requires authentication."
      },
      usage: {
        message: "This API serves as a middleware for Shopify Admin API and Storefront API",
        documentation: "See API_DOCUMENTATION.md for complete endpoint reference",
        testConsole: "/app/api-test"
      }
    });
  } catch (error) {
    return json({
      status: "unhealthy",
      error: error.message || "Server error",
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
