import { useState } from "react";
import { Page, Layout, Card, Button, TextField, Select, Banner, BlockStack, Text } from "@shopify/polaris";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function ApiTest() {
  const { apiKey } = useLoaderData();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  
  const [selectedEndpoint, setSelectedEndpoint] = useState("public-products");
  const [requestBody, setRequestBody] = useState("");
  const [queryParams, setQueryParams] = useState("");
  const [response, setResponse] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const endpoints = [
    { label: "Health Check", value: "health" },
    { label: "Status Check", value: "status" },
    { label: "Public Products", value: "public-products" },
    { label: "Public Customers (POST)", value: "public-customers-post" },
    { label: "Public Draft Orders (GET)", value: "public-draft-orders" },
    { label: "Public Draft Orders (POST)", value: "public-draft-orders-post" },
    { label: "Public Draft Order by ID", value: "public-draft-order-by-id" },
  ];

  const getEndpointDetails = (endpoint) => {
    const details = {
      "health": {
        method: "GET",
        url: "/api/health",
        description: "Get authenticated health check with shop details",
        sampleParams: "",
        sampleBody: ""
      },
      "status": {
        method: "GET",
        url: "/api/status",
        description: "Get public status check",
        sampleParams: "",
        sampleBody: ""
      },
      "public-products": {
        method: "GET",
        url: "/api/public/products",
        description: "Get products with public access (used by kiosk)",
        sampleParams: "first=10&tags=sample",
        sampleBody: ""
      },
      "public-customers-post": {
        method: "POST",
        url: "/api/public/customers",
        description: "Create or find customer via public API",
        sampleParams: "",
        sampleBody: `{
  "email": "customer@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+1234567890"
}`
      },
      "public-draft-orders": {
        method: "GET",
        url: "/api/public/draft-orders",
        description: "Get draft orders via public API",
        sampleParams: "first=5",
        sampleBody: ""
      },
      "public-draft-orders-post": {
        method: "POST",
        url: "/api/public/draft-orders",
        description: "Create draft order via public API",
        sampleParams: "",
        sampleBody: `{
  "customer": {
    "email": "customer@example.com",
    "firstName": "John",
    "lastName": "Doe"
  },
  "products": [
    {
      "variantId": "gid://shopify/ProductVariant/987654321",
      "quantity": 2
    }
  ],
  "source": "api-test"
}`
      },
      "public-draft-order-by-id": {
        method: "GET",
        url: "/api/public/draft-orders/123456789",
        description: "Get specific draft order by ID via public API",
        sampleParams: "",
        sampleBody: ""
      }
    };
    return details[endpoint] || details["public-products"];
  };

  const handleTest = async () => {
    setIsLoading(true);
    setResponse(null);
    
    try {
      const endpointDetails = getEndpointDetails(selectedEndpoint);
      let url = endpointDetails.url;
      
      if (queryParams) {
        url += `?${queryParams}`;
      }
      
      const options = {
        method: endpointDetails.method,
        headers: {
          'Content-Type': 'application/json',
        },
      };
      
      if (requestBody && endpointDetails.method !== "GET") {
        options.body = requestBody;
      }
      
      const response = await fetch(url, options);
      const data = await response.json();
      
      setResponse({
        status: response.status,
        statusText: response.statusText,
        data: data
      });
    } catch (error) {
      setResponse({
        status: 500,
        statusText: "Error",
        data: { error: error.message }
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEndpointChange = (value) => {
    setSelectedEndpoint(value);
    const details = getEndpointDetails(value);
    setQueryParams(details.sampleParams);
    setRequestBody(details.sampleBody);
    setResponse(null);
  };

  const currentEndpoint = getEndpointDetails(selectedEndpoint);

  return (
    <Page
      title="API Test Console"
      subtitle="Test the Complex Popup Service API endpoints"
      backAction={{
        content: "Back to Home",
        onAction: () => navigate("/app")
      }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="loose">
              <Text variant="headingMd">API Endpoint Testing</Text>
              
              <Select
                label="Select Endpoint"
                options={endpoints}
                value={selectedEndpoint}
                onChange={handleEndpointChange}
              />
              
              <Banner>
                <Text>
                  <strong>{currentEndpoint.method}</strong> {currentEndpoint.url}
                </Text>
                <Text>{currentEndpoint.description}</Text>
              </Banner>
              
              <TextField
                label="Query Parameters"
                value={queryParams}
                onChange={setQueryParams}
                placeholder="first=10&tags=sample"
                helpText="Add query parameters as key=value pairs separated by &"
              />
              
              {currentEndpoint.method !== "GET" && (
                <TextField
                  label="Request Body (JSON)"
                  value={requestBody}
                  onChange={setRequestBody}
                  multiline={4}
                  placeholder='{"key": "value"}'
                  helpText="Enter JSON request body for POST/PUT requests"
                />
              )}
              
              <Button
                primary
                onClick={handleTest}
                loading={isLoading}
                disabled={isLoading}
              >
                Test API
              </Button>
            </BlockStack>
          </Card>
        </Layout.Section>

        {response && (
          <Layout.Section>
            <Card>
              <BlockStack gap="loose">
                <Text variant="headingMd">Response</Text>
                
                <Banner status={response.status >= 200 && response.status < 300 ? "success" : "critical"}>
                  <Text>
                    Status: {response.status} {response.statusText}
                  </Text>
                </Banner>
                
                <div style={{ backgroundColor: 'var(--color-ui-background, #f6f6f7)', padding: '16px', borderRadius: '8px', overflow: 'auto' }}>
                  <pre style={{ margin: 0, fontSize: '12px', fontFamily: 'var(--font-mono, Monaco, Menlo, "Ubuntu Mono", monospace)' }}>
                    <code>
                      {JSON.stringify(response.data, null, 2)}
                    </code>
                  </pre>
                </div>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="loose">
              <Text variant="headingMd">Sample API Calls</Text>
              
              <div style={{ backgroundColor: 'var(--color-ui-background, #f6f6f7)', padding: '16px', borderRadius: '8px' }}>
                <Text variant="headingSm">JavaScript Example:</Text>
                <pre style={{ margin: '8px 0 0 0', fontSize: '12px', fontFamily: 'var(--font-mono, Monaco, Menlo, "Ubuntu Mono", monospace)' }}>
                  <code>
{`// Get products
const response = await fetch('/api/storefront/products?first=20');
const data = await response.json();

// Create customer
const customerResponse = await fetch('/api/admin/customers', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'customer@example.com',
    firstName: 'John',
    lastName: 'Doe'
  })
});
const customerData = await customerResponse.json();

// Create draft order
const draftOrderResponse = await fetch('/api/admin/draft-orders', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    customerId: customerData.customer.id,
    lineItems: [
      {
        variantId: 'gid://shopify/ProductVariant/123456789',
        quantity: 2
      }
    ],
    note: 'Created from API test'
  })
});
const draftOrderData = await draftOrderResponse.json();`}
                  </code>
                </pre>
              </div>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
