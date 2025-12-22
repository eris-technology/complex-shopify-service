import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { corsHeaders } from "../utils/cors";

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
    const { email, firstName, lastName, phone, customFields, privacyAgreed } = body;
    const publicRequest = request.headers.get('X-Public-Request');

    if (!email || !firstName || !lastName) {
      return json({ 
        error: "Missing required fields",
        message: "Email, first name, and last name are required"
      }, { 
        status: 400,
        headers: corsHeaders
      });
    }

    if (!privacyAgreed) {
      return json({ 
        error: "Privacy agreement required",
        message: "You must agree to the privacy policy and terms of service"
      }, { 
        status: 400,
        headers: corsHeaders
      });
    }

    console.log("Creating customer:", { email, firstName, lastName, phone, customFields, privacyAgreed });

    // Create note field with custom data
    const noteData = {
      customFields: customFields || {},
      privacyAgreed: privacyAgreed,
      createdAt: new Date().toISOString(),
      source: 'kiosk'
    };
    const noteField = JSON.stringify(noteData);

    if (publicRequest === 'true') {
      // For public requests, use direct Shopify Admin API
      console.log("Public customer creation request - using direct API");
      
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

      const customerCreateResponse = await fetch(`https://${shopDomain}/admin/api/2024-01/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken
        },
        body: JSON.stringify({
          query: `
            mutation customerCreate($input: CustomerInput!) {
              customerCreate(input: $input) {
                customer {
                  id
                  email
                  firstName
                  lastName
                  phone
                  note
                  createdAt
                  updatedAt
                }
                userErrors {
                  field
                  message
                }
              }
            }
          `,
          variables: {
            input: {
              email,
              firstName,
              lastName,
              phone: phone || null,
              note: noteField
            }
          }
        })
      });

      if (!customerCreateResponse.ok) {
        throw new Error(`Shopify API request failed: ${customerCreateResponse.status}`);
      }

      const customerData = await customerCreateResponse.json();

      // Log GraphQL query cost information from Shopify
      if (customerData.extensions && customerData.extensions.cost) {
        const cost = customerData.extensions.cost;
        console.log(`💰 Customer Creation - GraphQL Query Cost Information:`);
        console.log(`   🔋 Query Cost: ${cost.requestedQueryCost || 'N/A'}`);
        console.log(`   📊 Actual Query Cost: ${cost.actualQueryCost || 'N/A'}`);
        console.log(`   🏦 Available: ${cost.throttleStatus?.currentlyAvailable || 'N/A'}`);
        console.log(`   📈 Maximum Available: ${cost.throttleStatus?.maximumAvailable || 'N/A'}`);
        console.log(`   ⏱️  Restore Rate: ${cost.throttleStatus?.restoreRate || 'N/A'} per second`);
      } else {
        console.log(`💰 Customer Creation - No cost information available in response extensions`);
      }

      if (customerData.errors) {
        console.error("Shopify API errors:", customerData.errors);
        return json({ 
          error: "Shopify API error",
          details: customerData.errors
        }, { 
          status: 400,
          headers: corsHeaders
        });
      }

      if (customerData.data?.customerCreate?.userErrors?.length > 0) {
        const errors = customerData.data.customerCreate.userErrors;
        console.error("Customer creation errors:", errors);
        
        // Check if customer email already exists
        const emailExistsError = errors.find(error => 
          error.field?.includes('email') && 
          (error.message?.toLowerCase().includes('taken') || 
           error.message?.toLowerCase().includes('exists'))
        );

        // Check if phone number already exists
        const phoneExistsError = errors.find(error => 
          error.field?.includes('phone') && 
          (error.message?.toLowerCase().includes('taken') || 
           error.message?.toLowerCase().includes('exists'))
        );
        
        if (emailExistsError) {
          console.log("Customer email already exists, searching for existing customer...");
          
          // Search for existing customer by email
          const searchResponse = await fetch(`https://${shopDomain}/admin/api/2024-01/graphql.json`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': accessToken
            },
            body: JSON.stringify({
              query: `
                query getCustomers($query: String!) {
                  customers(first: 1, query: $query) {
                    edges {
                      node {
                        id
                        email
                        firstName
                        lastName
                        phone
                        note
                        createdAt
                        updatedAt
                      }
                    }
                  }
                }
              `,
              variables: {
                query: `email:${email}`
              }
            })
          });
          
          const searchData = await searchResponse.json();
          
          // Log GraphQL query cost information from Shopify for customer search
          if (searchData.extensions && searchData.extensions.cost) {
            const cost = searchData.extensions.cost;
            console.log(`💰 Customer Search - GraphQL Query Cost Information:`);
            console.log(`   🔋 Query Cost: ${cost.requestedQueryCost || 'N/A'}`);
            console.log(`   📊 Actual Query Cost: ${cost.actualQueryCost || 'N/A'}`);
            console.log(`   🏦 Available: ${cost.throttleStatus?.currentlyAvailable || 'N/A'}`);
            console.log(`   📈 Maximum Available: ${cost.throttleStatus?.maximumAvailable || 'N/A'}`);
            console.log(`   ⏱️  Restore Rate: ${cost.throttleStatus?.restoreRate || 'N/A'} per second`);
          } else {
            console.log(`💰 Customer Search - No cost information available in response extensions`);
          }
          
          if (searchData.data?.customers?.edges?.length > 0) {
            const existingCustomer = searchData.data.customers.edges[0].node;
            console.log("Found existing customer:", existingCustomer);
            
            // Check if the phone number matches the existing customer
            if (existingCustomer.phone && phone && existingCustomer.phone !== phone) {
              return json({ 
                error: "EMAIL_PHONE_MISMATCH",
                errorType: "EMAIL_PHONE_MISMATCH",
                message: "A customer with this email already exists, but the phone number doesn't match. Please verify your information.",
                existingPhone: existingCustomer.phone ? existingCustomer.phone.replace(/\d(?=\d{4})/g, '*') : null // Mask phone for privacy
              }, { 
                status: 400,
                headers: corsHeaders
              });
            }
            
            return json({
              success: true,
              customer: existingCustomer,
              message: "Customer already exists"
            }, {
              headers: corsHeaders
            });
          } else {
            return json({ 
              error: "Customer with this email already exists but could not be found",
              details: errors 
            }, { 
              status: 400,
              headers: corsHeaders
            });
          }
        } else if (phoneExistsError) {
          console.log("Phone number already exists, searching for existing customer...");
          
          // Search for existing customer by phone
          const phoneSearchResponse = await fetch(`https://${shopDomain}/admin/api/2024-01/graphql.json`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': accessToken
            },
            body: JSON.stringify({
              query: `
                query getCustomers($query: String!) {
                  customers(first: 1, query: $query) {
                    edges {
                      node {
                        id
                        email
                        firstName
                        lastName
                        phone
                        note
                        createdAt
                        updatedAt
                      }
                    }
                  }
                }
              `,
              variables: {
                query: `phone:${phone}`
              }
            })
          });
          
          const phoneSearchData = await phoneSearchResponse.json();
          
          if (phoneSearchData.data?.customers?.edges?.length > 0) {
            const existingCustomer = phoneSearchData.data.customers.edges[0].node;
            console.log("Found existing customer with this phone:", existingCustomer);
            
            // Check if the email matches the existing customer
            if (existingCustomer.email && email && existingCustomer.email !== email) {
              return json({ 
                error: "PHONE_EMAIL_MISMATCH",
                errorType: "PHONE_EMAIL_MISMATCH",
                message: "This phone number is already registered with a different email address. Please use a different phone number or check your email address.",
                existingEmail: existingCustomer.email ? existingCustomer.email.replace(/(.{2}).*(@.*)/, '$1***$2') : null // Mask email for privacy
              }, { 
                status: 400,
                headers: corsHeaders
              });
            }
            
            // If email also matches, return the existing customer
            return json({
              success: true,
              customer: existingCustomer,
              message: "Customer already exists"
            }, {
              headers: corsHeaders
            });
          } else {
            // Phone exists but we couldn't find the customer
            return json({ 
              error: "PHONE_ALREADY_TAKEN",
              errorType: "PHONE_ALREADY_TAKEN",
              message: "This phone number is already registered with another account. Please use a different phone number."
            }, { 
              status: 400,
              headers: corsHeaders
            });
          }
        } else {
          return json({ 
            error: "Failed to create customer", 
            details: errors 
          }, { 
            status: 400,
            headers: corsHeaders
          });
        }
      }

      const customer = customerData.data.customerCreate.customer;
      console.log("Customer created successfully:", customer);

      return json({
        success: true,
        customer: customer,
        message: "Customer created successfully"
      }, {
        headers: corsHeaders
      });

    } else {
      // For authenticated requests, use the existing Shopify app approach
      console.log("Authenticated customer creation request");
      const { admin } = await authenticate.admin(request);

      const customerCreateResponse = await admin.graphql(
        `#graphql
          mutation customerCreate($input: CustomerInput!) {
            customerCreate(input: $input) {
              customer {
                id
                email
                firstName
                lastName
                phone
                note
                createdAt
                updatedAt
              }
              userErrors {
                field
                message
              }
            }
          }
        `,
        {
          variables: {
            input: {
              email,
              firstName,
              lastName,
              phone: phone || null,
              note: noteField
            }
          }
        }
      );

      const customerData = await customerCreateResponse.json();

      // Log GraphQL query cost information from Shopify for authenticated customer creation
      if (customerData.extensions && customerData.extensions.cost) {
        const cost = customerData.extensions.cost;
        console.log(`💰 Authenticated Customer Creation - GraphQL Query Cost Information:`);
        console.log(`   🔋 Query Cost: ${cost.requestedQueryCost || 'N/A'}`);
        console.log(`   📊 Actual Query Cost: ${cost.actualQueryCost || 'N/A'}`);
        console.log(`   🏦 Available: ${cost.throttleStatus?.currentlyAvailable || 'N/A'}`);
        console.log(`   📈 Maximum Available: ${cost.throttleStatus?.maximumAvailable || 'N/A'}`);
        console.log(`   ⏱️  Restore Rate: ${cost.throttleStatus?.restoreRate || 'N/A'} per second`);
      } else {
        console.log(`💰 Authenticated Customer Creation - No cost information available in response extensions`);
      }

      if (customerData.data?.customerCreate?.userErrors?.length > 0) {
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
            `#graphql
              query getCustomers($query: String!) {
                customers(first: 1, query: $query) {
                  edges {
                    node {
                      id
                      email
                      firstName
                      lastName
                      phone
                      note
                      createdAt
                      updatedAt
                    }
                  }
                }
              }
            `,
            {
              variables: {
                query: `email:${email}`
              }
            }
          );
          
          const searchData = await searchResponse.json();
          
          // Log GraphQL query cost information from Shopify for authenticated customer search
          if (searchData.extensions && searchData.extensions.cost) {
            const cost = searchData.extensions.cost;
            console.log(`💰 Authenticated Customer Search - GraphQL Query Cost Information:`);
            console.log(`   🔋 Query Cost: ${cost.requestedQueryCost || 'N/A'}`);
            console.log(`   📊 Actual Query Cost: ${cost.actualQueryCost || 'N/A'}`);
            console.log(`   🏦 Available: ${cost.throttleStatus?.currentlyAvailable || 'N/A'}`);
            console.log(`   📈 Maximum Available: ${cost.throttleStatus?.maximumAvailable || 'N/A'}`);
            console.log(`   ⏱️  Restore Rate: ${cost.throttleStatus?.restoreRate || 'N/A'} per second`);
          } else {
            console.log(`💰 Authenticated Customer Search - No cost information available in response extensions`);
          }
          
          if (searchData.data?.customers?.edges?.length > 0) {
            const existingCustomer = searchData.data.customers.edges[0].node;
            console.log("Found existing customer:", existingCustomer.id);
            
            return json({
              success: true,
              customer: existingCustomer,
              message: "Customer already exists",
              isExisting: true
            }, {
              headers: corsHeaders
            });
          }
        }
        
        return json({ 
          error: "Failed to create customer",
          message: errors.map(e => e.message).join(', '),
          details: errors
        }, { 
          status: 400,
          headers: corsHeaders
        });
      }

      if (!customerData.data?.customerCreate?.customer) {
        throw new Error("No customer data returned from Shopify");
      }

      const customer = customerData.data.customerCreate.customer;
      console.log("Customer created successfully:", customer.id);

      return json({
        success: true,
        customer,
        message: "Customer created successfully",
        isExisting: false
      }, {
        headers: corsHeaders
      });
    }

  } catch (error) {
    console.error("Customer creation error:", error);
    
    if (error instanceof Response) {
      return json({
        error: "Authentication failed",
        message: "Unable to authenticate request"
      }, { 
        status: 401,
        headers: corsHeaders
      });
    }

    return json({
      error: error.message || error.toString() || "Unknown error",
      message: "Failed to create customer"
    }, { 
      status: 500,
      headers: corsHeaders
    });
  }
}

// Handle preflight requests
export async function options({ request }) {
  return new Response(null, { status: 200, headers: corsHeaders });
}
