import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  Box,
  List,
  Link,
  InlineStack,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  return null;
};

export default function Index() {
  return (
    <Page>
      <TitleBar title="Complex Popup Service API" />
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="500">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Complex Popup Service API 🚀
                  </Text>
                  <Text variant="bodyMd" as="p">
                    This app provides a public API for accessing Shopify store data via secure endpoints. 
                    Use these endpoints in your kiosk displays, POS extensions, and other client applications to 
                    interact with your Shopify store data without requiring admin authentication.
                  </Text>
                </BlockStack>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">
                    Available API Endpoints
                  </Text>
                  <Text as="p" variant="bodyMd">
                    Your API is running at <strong>{typeof window !== 'undefined' ? window.location.origin : 'your-app-url.com'}</strong>. 
                    Here are the available endpoints for your client applications:
                  </Text>
                  <List>
                    <List.Item>
                      <strong>GET /api/public/products</strong> - Get products for public access (used by kiosk)
                    </List.Item>
                    <List.Item>
                      <strong>POST /api/public/customers</strong> - Create customers via public API
                    </List.Item>
                    <List.Item>
                      <strong>GET/POST /api/public/draft-orders</strong> - Manage draft orders via public API
                    </List.Item>
                    <List.Item>
                      <strong>GET /api/public/draft-orders/:id</strong> - Get specific draft order by ID
                    </List.Item>
                    <List.Item>
                      <strong>GET /api/health</strong> - Authenticated health check endpoint
                    </List.Item>
                    <List.Item>
                      <strong>GET /api/status</strong> - Public status check endpoint
                    </List.Item>
                  </List>
                </BlockStack>
                <InlineStack gap="300">
                  <Button url="/app/api-test" variant="primary">
                    Test API Endpoints
                  </Button>
                  <Button 
                    url={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/health`}
                    target="_blank"
                    variant="plain"
                  >
                    Authenticated Health Check
                  </Button>
                  <Button 
                    url={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/status`}
                    target="_blank"
                    variant="plain"
                  >
                    Public Status
                  </Button>
                  <Button 
                    url="/kiosk"
                    target="_blank"
                    variant="secondary"
                  >
                    🏪 Kiosk Page (Public)
                  </Button>
                </InlineStack>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">
                    Quick Start Example
                  </Text>
                  <Text as="p" variant="bodyMd">
                    Here's how to call your API from your client applications:
                  </Text>
                  <Box
                    padding="400"
                    background="bg-surface-active"
                    borderWidth="025"
                    borderRadius="200"
                    borderColor="border"
                    overflowX="scroll"
                  >
                    <pre style={{ margin: 0, fontSize: '12px' }}>
                      <code>
{`// Get products for your kiosk display
const response = await fetch('${typeof window !== 'undefined' ? window.location.origin : 'your-app-url.com'}/api/public/products?first=20');
const data = await response.json();

// Create a customer
const customerResponse = await fetch('${typeof window !== 'undefined' ? window.location.origin : 'your-app-url.com'}/api/public/customers', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'customer@example.com',
    firstName: 'John',
    lastName: 'Doe'
  })
});

// Create a draft order/wishlist
const draftOrderResponse = await fetch('${typeof window !== 'undefined' ? window.location.origin : 'your-app-url.com'}/api/public/draft-orders', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    customer: {
      email: 'customer@example.com',
      firstName: 'John',
      lastName: 'Doe'
    },
    products: [
      {
        variantId: 'gid://shopify/ProductVariant/987654321',
        quantity: 2
      }
    ],
    source: 'api-example'
  })
});`}
                      </code>
                    </pre>
                  </Box>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <BlockStack gap="500">
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    API Configuration
                  </Text>
                  <BlockStack gap="200">
                    <InlineStack align="space-between">
                      <Text as="span" variant="bodyMd">
                        API Base URL
                      </Text>
                      <Text as="span" variant="bodyMd" fontWeight="bold">
                        {typeof window !== 'undefined' ? window.location.origin : 'your-app-url.com'}
                      </Text>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text as="span" variant="bodyMd">
                        Authentication
                      </Text>
                      <Text as="span" variant="bodyMd">
                        Shopify App Auth
                      </Text>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text as="span" variant="bodyMd">
                        CORS
                      </Text>
                      <Text as="span" variant="bodyMd">
                        Enabled
                      </Text>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text as="span" variant="bodyMd">
                        Rate Limiting
                      </Text>
                      <Text as="span" variant="bodyMd">
                        Shopify Limits
                      </Text>
                    </InlineStack>
                  </BlockStack>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Resources & Documentation
                  </Text>
                  <List>
                    <List.Item>
                      <Link url="/app/api-test" removeUnderline>
                        API Test Console
                      </Link>{" "}
                      - Test all endpoints interactively
                    </List.Item>
                    <List.Item>
                      <strong>Full API Documentation</strong> - See API_DOCUMENTATION.md in project root
                    </List.Item>
                    <List.Item>
                      <Link
                        url={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/health`}
                        target="_blank"
                        removeUnderline
                      >
                        Health Check
                      </Link>{" "}
                      - Verify API status
                    </List.Item>
                    <List.Item>
                      <Link
                        url="https://shopify.dev/docs/api/admin-graphql"
                        target="_blank"
                        removeUnderline
                      >
                        Shopify GraphQL API
                      </Link>{" "}
                      - Underlying API reference
                    </List.Item>
                  </List>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Integration Examples
                  </Text>
                  <List>
                    <List.Item>
                      <strong>Kiosk Display:</strong> Use /api/public/products for product browsing
                    </List.Item>
                    <List.Item>
                      <strong>Customer Registration:</strong> Use /api/public/customers for user registration
                    </List.Item>
                    <List.Item>
                      <strong>Wishlist Creation:</strong> Use /api/public/draft-orders for order creation
                    </List.Item>
                    <List.Item>
                      <strong>Order Retrieval:</strong> Use /api/public/draft-orders/:id for order lookup
                    </List.Item>
                  </List>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
