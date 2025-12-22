import { json } from "@remix-run/node";
import { useLoaderData, Form, useActionData, useNavigation } from "@remix-run/react";
import { useState, useEffect } from "react";
import QRCode from "qrcode";
import CountryCodeSelector from "../components/CountryCodeSelector.jsx";
import LanguageSelector from "../components/LanguageSelector.jsx";
import { countries } from "../lib/countries.js";
import { useTranslation, getInitialLanguage, saveLanguagePreference } from "../lib/localization.js";

// This is a public route - no authentication required
export async function loader({ request }) {
  return json({
    title: "Shopping List Kiosk",
    apiBaseUrl: new URL(request.url).origin,
    maxItemsPerOrder: parseInt(process.env.MAX_ITEMS_PER_ORDER || '10', 10)
  });
}

export async function action({ request }) {
  const formData = await request.formData();
  const action = formData.get("action");

  if (action === "create-draft-order") {
    // Create draft order using your public API
    const customerData = {
      firstName: formData.get("firstName"),
      lastName: formData.get("lastName"),
      email: formData.get("email"),
      phone: formData.get("phone")
    };

    const products = JSON.parse(formData.get("products") || "[]");

    try {
      // Call your public draft order API - construct full URL with proper protocol
      const apiUrl = new URL("/api/public/draft-orders", request.url);
      const response = await fetch(apiUrl.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Public-Request": "true" // Flag for public requests
        },
        body: JSON.stringify({
          customer: customerData,
          products: products,
          source: "kiosk"
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`API Error: ${response.status} - ${errorData.error || 'Unknown error'}`);
      }

      const result = await response.json();

      return json({
        success: true,
        draftOrder: result.draftOrder,
        message: "Wishlist created successfully!"
      });
    } catch (error) {
      console.error("Wishlist creation failed:", error);
      return json({
        success: false,
        error: error.message || "Failed to create wishlist"
      }, { status: 500 });
    }
  }

  return json({ success: false, error: "Invalid action" }, { status: 400 });
}

export default function KioskPage() {
  const { title, apiBaseUrl, maxItemsPerOrder } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();

  const [products, setProducts] = useState([]);
  const [allProducts, setAllProducts] = useState([]); // Store all products for filtering
  const [selectedCategory, setSelectedCategory] = useState(null); // Track selected category
  const [availableCategories, setAvailableCategories] = useState([]); // Dynamic categories
  const [selectedBarcodes, setSelectedBarcodes] = useState([]);
  // New state for detailed selections with quantity and variant info
  const [selectedItems, setSelectedItems] = useState([]); // [{barcode, variantId, quantity, productTitle, price, image}]
  // New state to track quantities by original product ID for SKU-based limits
  const [productQuantities, setProductQuantities] = useState({}); // {originalProductId: totalQuantity}
  const [showOrderCompleteModal, setShowOrderCompleteModal] = useState(false);
  const [showUserForm, setShowUserForm] = useState(false);
  const [showSummaryPopup, setShowSummaryPopup] = useState(false); // New state for summary popup
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const [notification, setNotification] = useState(null); // { type: 'error'|'success'|'warning', message: string }
  const [pendingBarcode, setPendingBarcode] = useState(null);
  const [draftOrder, setDraftOrder] = useState(null);
  const [barcodeDataUrl, setBarcodeDataUrl] = useState(null);
  const [isQRExpanded, setIsQRExpanded] = useState(false); // State for expanded QR code

  // Localization state
  const [currentLanguage, setCurrentLanguage] = useState('en');
  const { t } = useTranslation(currentLanguage);

  // Multi-step flow state - New Flow: Selection (Page) -> Summary (Popup) -> Personal Information (Page) -> QR Code (Page)
  const [currentStep, setCurrentStep] = useState('products'); // 'products', 'userForm', 'qrCode' - summary is now a popup
  const [userDetails, setUserDetails] = useState({
    email: '',
    firstName: '',
    lastName: '',
    phone: '',
    customerId: null,
    // Custom fields that will be stored in Shopify's note field
    customFields: {
      region: '',
      gender: '',
      interests: '',
      referralSource: '',
      newsletter: false
    },
    privacyAgreed: false
  });

  // Phone number country code state
  const [selectedCountry, setSelectedCountry] = useState(
    countries.find(c => c.code === '+852') || countries.find(c => c.code !== 'other')
  ); // Default to Hong Kong, fallback to first non-other country

  // Product popup modal state
  const [showProductPopup, setShowProductPopup] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [selectedQuantity, setSelectedQuantity] = useState(1);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isEditMode, setIsEditMode] = useState(false); // Track if popup is for editing existing item

  const isSubmitting = navigation.state === "submitting";

  // Fetch products from your public API
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        // Use relative URL to inherit the same protocol as the current page
        // Collection filtering is now handled server-side for security
        const res = await fetch("/api/public/products", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "X-Public-Request": "true" // Flag for public requests
          }
        });

        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }

        const data = await res.json();
        console.log('Products fetched from public API:', data);
        console.log('Server-side filters applied:', data.filters);

        // Debug: Log raw products data before transformation
        const rawProducts = data.products?.edges?.map(edge => edge.node) || data.products || [];
        console.log(`🔥 RAW PRODUCTS DATA (${rawProducts.length} products):`);
        rawProducts.forEach((product, index) => {
          if (index < 3) { // Only log first 3 for brevity
            console.log(`   Product ${index + 1}: "${product.title}"`);
            console.log(`     maxPerOrder: ${product.maxPerOrder} (${typeof product.maxPerOrder})`);
            console.log(`     bundleOnly: ${product.bundleOnly} (${typeof product.bundleOnly})`);
            console.log(`     metafields count: ${product.metafields ? product.metafields.length : 0}`);
            if (product.metafields && product.metafields.length > 0) {
              product.metafields.slice(0, 2).forEach(mf => {
                console.log(`       - ${mf.key}: ${mf.value}`);
              });
            }
          }
        });

        // Transform the data to match the expected format
        // Each variant becomes a separate product item in the list
        const transformedProducts = [];

        rawProducts.forEach(product => {
          // Only include products that have variants with barcodes
          const validVariants = product.variants?.edges?.filter(variantEdge =>
            variantEdge.node.barcode
          ) || [];

          if (validVariants.length > 0) {
            // Debug logging for each product's metafields
            console.log(`🏷️ Frontend - Processing product: "${product.title}"`);
            console.log(`🔍 Product maxPerOrder: ${product.maxPerOrder} (type: ${typeof product.maxPerOrder})`);
            console.log(`🔍 Product bundleOnly: ${product.bundleOnly} (type: ${typeof product.bundleOnly})`);

            if (product.metafields && product.metafields.length > 0) {
              console.log(`📝 Product metafields (${product.metafields.length}):`);
              product.metafields.forEach((mf, index) => {
                console.log(`  ${index + 1}. Key: "${mf.key}", Value: "${mf.value}", Namespace: "${mf.namespace}"`);
              });
            } else {
              console.log(`❌ No metafields found in frontend data for "${product.title}"`);
            }

            // Create a separate item for each variant
            validVariants.forEach(variantEdge => {
              const variant = variantEdge.node;

              // Create a variant-specific product title if the variant has a meaningful title
              const variantTitle = variant.title !== "Default Title" && variant.title !== product.title
                ? `${variant.title}, ${product.title}`
                : product.title;

              transformedProducts.push({
                id: `${product.id}-${variant.id}`, // Unique ID for each variant item
                originalProductId: product.id, // Keep reference to original product
                title: variantTitle,
                handle: product.handle,
                description: product.description,
                availableForSale: variant.availableForSale,
                maxPerOrder: variant.maxPerOrder || product.maxPerOrder, // Use variant or product maxPerOrder
                bundleOnly: variant.bundleOnly || product.bundleOnly,     // Use variant or product bundleOnly
                metafields: [...(product.metafields || []), ...(variant.metafields || [])], // Combine metafields
                tags: product.tags || [],
                variants: {
                  edges: [variantEdge] // Only include this specific variant
                },
                images: variant.image ? { edges: [{ node: variant.image }] } : product.images
              });
            });

            console.log(`✅ Added product "${product.title}" as ${validVariants.length} separate variant items`);
          }
        });

        console.log(`📊 Transformed ${rawProducts.length} raw products into ${transformedProducts.length} grouped products`);
        console.log(`📦 Total variants across all products: ${transformedProducts.reduce((sum, p) => sum + p.variants.edges.length, 0)}`);

        // Extract unique tags/categories from all products
        const allTags = new Set();
        rawProducts.forEach(product => {
          if (product.tags && Array.isArray(product.tags)) {
            product.tags.forEach(tag => {
              if (tag && tag.trim()) {
                allTags.add(tag.trim().toUpperCase());
              }
            });
          }
        });

        // Create categories array with alphabetically sorted tags
        const categories = Array.from(allTags).sort();
        console.log('📋 Available categories:', categories);

        setAvailableCategories(categories);
        setAllProducts(transformedProducts);

        // Show all products by default (no category selected)
        setProducts(transformedProducts);
        console.log(`🏷️ Default state: showing all ${transformedProducts.length} products (no filter selected)`);
      } catch (error) {
        console.error("Error fetching products from public API:", error);
        // Fallback to empty array
        setProducts([]);
      }
    };

    fetchProducts();
  }, []);

  // Initialize language from localStorage or browser preference
  useEffect(() => {
    const initialLanguage = getInitialLanguage();
    setCurrentLanguage(initialLanguage);
  }, []);

  // Product quantity helper functions for SKU-based limits
  const getTotalProductQuantity = (originalProductId) => {
    return selectedItems
      .filter(item => item.originalProductId === originalProductId)
      .reduce((sum, item) => sum + item.quantity, 0);
  };

  const wouldExceedProductLimit = (originalProductId, additionalQuantity, maxPerProduct = 10) => {
    const currentTotal = getTotalProductQuantity(originalProductId);
    return (currentTotal + additionalQuantity) > maxPerProduct;
  };

  const getProductMaxQuantity = (product) => {
    // Check for maxPerProduct in metafields or use default of 10
    const maxPerProductMetafield = product.metafields?.find(
      meta => meta.key === 'maxPerProduct' || meta.key === 'max_per_product' || meta.key === 'maxperproduct'
    );

    if (maxPerProductMetafield) {
      const value = parseInt(maxPerProductMetafield.value);
      console.log(`📊 Product "${product.title}": maxPerProduct found in metafield "${maxPerProductMetafield.key}" = ${value}`);
      return value;
    } else {
      console.log(`📊 Product "${product.title}": No maxPerProduct metafield found, using default = 10`);

      // Show all available metafields for debugging
      if (product.metafields && product.metafields.length > 0) {
        console.log(`🔍 Available metafields for "${product.title}":`);
        product.metafields.forEach((meta, index) => {
          console.log(`   ${index + 1}. key: "${meta.key}", value: "${meta.value}", type: ${typeof meta.value}`);
        });
      } else {
        console.log(`❌ No metafields at all for "${product.title}"`);
      }

      return 10;
    }
  };

  const getRemainingProductQuantity = (product) => {
    const maxPerProduct = getProductMaxQuantity(product);
    const currentTotal = getTotalProductQuantity(product.originalProductId);
    return Math.max(0, maxPerProduct - currentTotal);
  };

  // Update product quantities tracking whenever selectedItems changes
  useEffect(() => {
    const newProductQuantities = {};
    selectedItems.forEach(item => {
      if (!newProductQuantities[item.originalProductId]) {
        newProductQuantities[item.originalProductId] = 0;
      }
      newProductQuantities[item.originalProductId] += item.quantity;
    });
    setProductQuantities(newProductQuantities);
  }, [selectedItems]);

  // Handle language change
  const handleLanguageChange = (newLanguage) => {
    setCurrentLanguage(newLanguage);
    saveLanguagePreference(newLanguage);
  };

  // Filter products based on selected category
  const handleCategoryFilter = (category) => {
    if (selectedCategory === category) {
      // If clicking the same category, deselect it (show all products)
      setSelectedCategory(null);
      setProducts(allProducts);
      console.log(`🏷️ Deselected category: ${category}, showing all ${allProducts.length} products`);
    } else {
      // Select new category and filter products
      setSelectedCategory(category);
      const filteredProducts = allProducts.filter(product => {
        return product.tags && product.tags.some(tag =>
          tag.trim().toUpperCase() === category.toUpperCase()
        );
      });
      setProducts(filteredProducts);
      console.log(`🏷️ Filtered to category: ${category}, showing ${filteredProducts.length} products`);
    }
  };

  const toggleSelect = (product) => {
    if (!product || !product.variants?.edges?.length) return;

    const variant = product.variants.edges[0].node; // Each product now has only one variant

    // Check if this specific variant is already selected
    const isSelected = selectedBarcodes.includes(variant.barcode);

    if (isSelected) {
      // Product is already selected, open popup for editing quantity
      console.log(`🎯 Opening popup for selected item: "${product.title}"`);

      setSelectedProduct(product);
      setSelectedVariant(variant);
      setSelectedQuantity(getCurrentQuantity(variant.barcode)); // Set to current quantity
      setCurrentImageIndex(0);
      setIsEditMode(true); // Set edit mode for existing items
      setShowProductPopup(true);
      return;
    }

    // Open popup for quantity selection only (no variant selection needed)
    console.log(`🎯 Opening popup for item: "${product.title}"`);
    console.log(`🔍 Product data in popup:`, {
      maxPerOrder: product.maxPerOrder,
      bundleOnly: product.bundleOnly,
      hasMetafields: product.metafields ? product.metafields.length : 0
    });

    if (product.maxPerOrder) {
      console.log(`✅ MaxPerOrder found in popup: ${product.maxPerOrder} (will limit quantity to this value)`);
    } else {
      console.log(`❌ MaxPerOrder NOT found in popup (will default to 5)`);
    }

    setSelectedProduct(product);
    setSelectedVariant(variant); // Set the only variant
    setSelectedQuantity(1);
    setCurrentImageIndex(0); // Reset to first image
    setIsEditMode(false); // Set add mode for new items
    setShowProductPopup(true);
  };

  const handleAddToWishlist = () => {
    if (!selectedVariant || selectedQuantity < 1) return;

    // Check maximum items per order limit
    const currentTotalItems = selectedItems.reduce((total, item) => total + item.quantity, 0);
    const existingItem = selectedItems.find(item => item.barcode === selectedVariant.barcode);
    const newTotalItems = existingItem
      ? currentTotalItems - existingItem.quantity + selectedQuantity
      : currentTotalItems + selectedQuantity;

    if (newTotalItems > maxItemsPerOrder) {
      const remainingSlots = maxItemsPerOrder - (currentTotalItems - (existingItem?.quantity || 0));
      showNotification(
        `Maximum ${maxItemsPerOrder} items allowed per order. You can add ${remainingSlots} more item${remainingSlots !== 1 ? 's' : ''}.`,
        'error'
      );
      return;
    }

    // Check BundleOnly validation
    console.log(`🔍 BundleOnly validation for "${selectedProduct.title}"`);
    console.log(`  Product bundleOnly: ${selectedProduct.bundleOnly}`);
    console.log(`  Current cart items: ${selectedItems.length}`);

    if (selectedProduct.bundleOnly) {
      // This is a bundle-only item, check if there are any non-bundle items in the cart
      const hasNonBundleItems = selectedItems.some(item => {
        // Find the product data for this item to check its bundleOnly status
        const itemProduct = allProducts.find(product =>
          product.variants.edges.some(edge => edge.node.barcode === item.barcode)
        );
        const isNonBundle = !itemProduct?.bundleOnly;
        console.log(`  Checking item "${item.productTitle}": bundleOnly=${itemProduct?.bundleOnly}, isNonBundle=${isNonBundle}`);
        return isNonBundle;
      });

      console.log(`  Has non-bundle items in cart: ${hasNonBundleItems}`);

      if (!hasNonBundleItems) {
        alert('Bundle items can only be added when you have at least one regular item in your wishlist. Please add a regular item first.');
        return;
      }

      console.log(`✅ Bundle validation passed - non-bundle items exist in cart`);
    } else {
      console.log(`✅ Regular item - no bundle validation needed`);
    }

    // Check product-level quantity limits
    const maxPerProduct = getProductMaxQuantity(selectedProduct);
    if (wouldExceedProductLimit(selectedProduct.originalProductId, selectedQuantity, maxPerProduct)) {
      const currentProductTotal = getTotalProductQuantity(selectedProduct.originalProductId);
      const remaining = maxPerProduct - currentProductTotal;
      showNotification(
        t('validation.productLimitExceeded', {
          max: maxPerProduct,
          productName: selectedProduct.title.split(',')[0],
          current: String(currentProductTotal),
          remaining: String(remaining)
        }),
        'error'
      );
      return;
    }

    // Create selection object
    const selectionItem = {
      barcode: selectedVariant.barcode,
      variantId: selectedVariant.id,
      originalProductId: selectedProduct.originalProductId, // Add for product-level tracking
      quantity: selectedQuantity,
      productTitle: selectedProduct.title,
      variantTitle: selectedVariant.title,
      price: selectedVariant.price.amount,
      image: selectedVariant.image?.url || selectedProduct.images?.edges?.[0]?.node?.url || null,
      bundleOnly: selectedProduct.bundleOnly // Add bundleOnly info to the cart item
    };

    // Add to selectedItems (for detailed tracking)
    setSelectedItems((prev) => {
      const existingIndex = prev.findIndex(item => item.barcode === selectedVariant.barcode);
      if (existingIndex !== -1) {
        // Update existing item quantity
        const newItems = [...prev];
        newItems[existingIndex] = selectionItem;
        return newItems;
      } else {
        return [...prev, selectionItem];
      }
    });

    // Also add to selectedBarcodes for backward compatibility
    setSelectedBarcodes((prev) => {
      if (prev.includes(selectedVariant.barcode)) {
        return prev; // Already exists
      }
      return [...prev, selectedVariant.barcode];
    });

    // Close the popup
    handleClosePopup();
  };

  // Function to handle editing existing item quantity
  const handleEditExistingItem = () => {
    if (!selectedVariant || selectedQuantity < 1) return;

    // Check product-level quantity limits for edited quantity
    const existingItem = selectedItems.find(item => item.barcode === selectedVariant.barcode);
    const quantityDifference = selectedQuantity - (existingItem?.quantity || 0);

    if (quantityDifference > 0) {
      const maxPerProduct = getProductMaxQuantity(selectedProduct);
      if (wouldExceedProductLimit(selectedProduct.originalProductId, quantityDifference, maxPerProduct)) {
        const currentProductTotal = getTotalProductQuantity(selectedProduct.originalProductId);
        const remaining = maxPerProduct - currentProductTotal;
        showNotification(
          t('validation.productLimitExceeded', {
            max: maxPerProduct,
            productName: selectedProduct.title.split(',')[0],
            current: String(currentProductTotal),
            remaining: String(remaining)
          }),
          'error'
        );
        return;
      }
    }

    // Update selectedItems with new quantity
    setSelectedItems((prev) => {
      const existingIndex = prev.findIndex(item => item.barcode === selectedVariant.barcode);
      if (existingIndex !== -1) {
        const updatedItems = [...prev];
        updatedItems[existingIndex] = {
          ...updatedItems[existingIndex],
          quantity: selectedQuantity
        };
        return updatedItems;
      }
      return prev;
    });

    // Close the popup
    handleClosePopup();
  };

  const handleClosePopup = () => {
    setShowProductPopup(false);
    setSelectedProduct(null);
    setSelectedVariant(null);
    setSelectedQuantity(1);
    setCurrentImageIndex(0); // Reset image index
    setIsEditMode(false); // Reset edit mode
  };

  // Extract size from variant title for display in bubble
  const extractSizeFromVariant = (variant, productTitle) => {
    if (!variant || !variant.title) return null;

    // If the variant title is "Default Title", no size bubble needed
    if (variant.title === "Default Title") return null;

    // Remove the product title from variant title to get just the size part
    let sizeText = variant.title;
    if (sizeText.includes(productTitle)) {
      sizeText = sizeText.replace(productTitle, '').trim();
      // Remove common separators
      sizeText = sizeText.replace(/^[-\s]*/, '').replace(/[-\s]*$/, '');
    }

    // Check if it looks like a size (common size patterns)
    const sizePatterns = [
      /^(XXS|XS|S|M|L|XL|XXL|XXXL|2XL|3XL|4XL|5XL)$/i,
      /^(EXTRA\s+SMALL|SMALL|MEDIUM|LARGE|EXTRA\s+LARGE)$/i,
      /^(ONE\s+SIZE|OS|ONESIZE)$/i,
      /^\d+(\.\d+)?(CM|MM|IN|"|')?$/i, // numeric sizes
      /^(US\s*|UK\s*|EU\s*)?\d+(\.\d+)?$/i // shoe sizes
    ];

    // Check if the extracted text matches size patterns
    const isSize = sizePatterns.some(pattern => pattern.test(sizeText));

    if (isSize && sizeText.length <= 6) { // Reasonable size text length
      return sizeText.toUpperCase();
    }

    return null;
  };

  // Get all available images for the selected product
  const getAvailableImages = () => {
    if (!selectedProduct) return [];

    const images = [];

    // Add all product images first
    if (selectedProduct.images?.edges) {
      selectedProduct.images.edges.forEach(({ node }) => {
        images.push({
          url: node.url,
          altText: node.altText || selectedProduct.title
        });
      });
    }

    // Add variant-specific images if they're not already included
    if (selectedVariant?.image?.url) {
      const variantImage = {
        url: selectedVariant.image.url,
        altText: selectedVariant.image.altText || selectedProduct.title
      };

      // Only add if it's not already in the array
      if (!images.some(img => img.url === variantImage.url)) {
        // Add variant image at the beginning if it's different
        images.unshift(variantImage);
      }
    }

    return images;
  };

  const handlePreviousImage = () => {
    const images = getAvailableImages();
    setCurrentImageIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  };

  const handleNextImage = () => {
    const images = getAvailableImages();
    setCurrentImageIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  };

  const handleUserFormSubmit = async (e) => {
    e.preventDefault();

    // Clear any browser validation states
    const form = e.target;
    if (form && form.checkValidity && !form.checkValidity()) {
      // If form is not valid, let browser show its validation messages
      return;
    }

    // Additional validation for email format
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(userDetails.email)) {
      showNotification('Please enter a valid email address.', 'error');
      return;
    }

    // Validate required fields
    if (!userDetails.firstName.trim()) {
      showNotification('First name is required.', 'error');
      return;
    }

    if (!userDetails.lastName.trim()) {
      showNotification('Last name is required.', 'error');
      return;
    }

    if (!userDetails.email.trim()) {
      showNotification('Email is required.', 'error');
      return;
    }

    if (!userDetails.privacyAgreed) {
      showNotification('You must agree to the terms and privacy policy.', 'error');
      return;
    }

    // Phone number is now optional - only validate if provided
    if (userDetails.phone.trim()) {
      if (selectedCountry.code === 'other') {
        // For "other" country code, validate full international format if phone is provided
        // Check if phone number starts with + (international format)
        if (!userDetails.phone.startsWith('+')) {
          showNotification('When selecting "Other" country code, please enter your phone number in international format starting with + (e.g., +33123456789)', 'error');
          return;
        }

        // Basic validation for international phone number format
        const phonePattern = /^\+[1-9]\d{1,14}$/; // + followed by 1-15 digits, no leading zero after +
        if (!phonePattern.test(userDetails.phone)) {
          showNotification('Please enter a valid international phone number format (e.g., +33123456789)', 'error');
          return;
        }
      } else {
        // For specific country codes, validate the local phone number part if provided
        // Validate that phone contains only digits, spaces, hyphens, and parentheses
        const localPhonePattern = /^[0-9\s\-\(\)]+$/;
        if (!localPhonePattern.test(userDetails.phone)) {
          showNotification('Please enter a valid phone number using only digits, spaces, hyphens, and parentheses.', 'error');
          return;
        }

        // Remove spaces, hyphens, and parentheses to check digit count
        const digitsOnly = userDetails.phone.replace(/[\s\-\(\)]/g, '');
        if (digitsOnly.length < 6 || digitsOnly.length > 15) {
          showNotification('Please enter a phone number with 6 to 15 digits.', 'error');
          return;
        }
      }
    }

    setIsCreatingCustomer(true);

    try {
      // Prepare the phone number with country code
      const fullPhoneNumber = selectedCountry.code === 'other'
        ? userDetails.phone
        : `${selectedCountry.code}${userDetails.phone}`;

      // Create customer through public API
      const customerResponse = await fetch("/api/public/customers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Public-Request": "true"
        },
        body: JSON.stringify({
          email: userDetails.email,
          firstName: userDetails.firstName,
          lastName: userDetails.lastName,
          phone: fullPhoneNumber,
          customFields: userDetails.customFields,
          privacyAgreed: userDetails.privacyAgreed
          // Note: customerId is intentionally excluded as it's not part of CustomerInput
        })
      });

      if (!customerResponse.ok) {
        const errorData = await customerResponse.json().catch(() => ({}));

        // Handle specific error types
        if (errorData.errorType) {
          switch (errorData.errorType) {
            case 'EMAIL_PHONE_MISMATCH':
              throw new Error(`Email-Phone Mismatch: ${errorData.message}`);
            case 'PHONE_EMAIL_MISMATCH':
              throw new Error(`Phone-Email Mismatch: ${errorData.message}`);
            case 'PHONE_ALREADY_TAKEN':
              throw new Error(`Phone Already Taken: ${errorData.message}`);
            default:
              throw new Error(`Validation Error: ${errorData.message || 'Unknown error'}`);
          }
        }

        // Handle Shopify validation errors
        if (errorData.details && Array.isArray(errorData.details)) {
          const errors = errorData.details;

          // Find specific error types
          const phoneError = errors.find(error =>
            error.field?.includes('phone') && error.message
          );
          const emailError = errors.find(error =>
            error.field?.includes('email') && error.message
          );

          if (phoneError) {
            throw new Error(`Phone error: ${phoneError.message}`);
          }
          if (emailError) {
            throw new Error(`Email error: ${emailError.message}`);
          }

          // Generic validation error
          const firstError = errors[0];
          if (firstError && firstError.message) {
            throw new Error(`Validation error: ${firstError.message}`);
          }
        }

        throw new Error(`Failed to create customer: ${errorData.error || 'Unknown error'}`);
      }

      const customerData = await customerResponse.json();
      console.log('Customer created:', customerData);

      // Update user details with customer ID
      const customerId = customerData.customer?.id;
      setUserDetails(prev => ({
        ...prev,
        customerId: customerId
      }));

      // New Flow: After user form submission, create wishlist and go to QR code page
      // Call the wishlist creation logic directly with the customer ID
      try {
        await createWishlistAndShowQR(customerId);
      } catch (wishlistError) {
        console.error('Failed to create wishlist after customer creation:', wishlistError);
        showNotification('Customer created successfully, but failed to create wishlist. Please try again.', 'warning');
      }

    } catch (error) {
      console.error('Failed to create customer:', error);

      // Clear form errors first
      setFormErrors({});

      // Parse error message for specific issues
      let errorMessage = error.message || '';

      // Handle specific cross-field validation errors
      if (errorMessage.includes('Email-Phone Mismatch:')) {
        const message = errorMessage.replace('Email-Phone Mismatch:', '').trim();
        setFormErrors({ email: 'Email already exists with different phone', phone: 'Phone doesn\'t match existing email' });
        showNotification(`Account Mismatch: ${message}`, 'error');
      }
      else if (errorMessage.includes('Phone-Email Mismatch:')) {
        const message = errorMessage.replace('Phone-Email Mismatch:', '').trim();
        setFormErrors({ phone: 'Phone already exists with different email', email: 'Email doesn\'t match existing phone' });
        showNotification(`Account Mismatch: ${message}`, 'error');
      }
      else if (errorMessage.includes('Phone Already Taken:')) {
        const message = errorMessage.replace('Phone Already Taken:', '').trim();
        setFormErrors({ phone: 'This phone number is already registered' });
        showNotification(`Phone Number Issue: ${message}`, 'error');
      }
      // Check if it's a phone already taken error (legacy)
      else if (errorMessage.toLowerCase().includes('phone has already been taken') ||
        (errorMessage.toLowerCase().includes('phone') && errorMessage.toLowerCase().includes('taken'))) {
        setFormErrors({ phone: 'This phone number is already registered' });
        showNotification('This phone number is already registered with another account. Please use a different phone number.', 'error');
      }
      // Check if it's any phone error
      else if (errorMessage.toLowerCase().includes('phone error:')) {
        const phoneMessage = errorMessage.replace('phone error:', '').trim();
        setFormErrors({ phone: phoneMessage });
        showNotification(`Phone number issue: ${phoneMessage}`, 'error');
      }
      // Check if it's an email already taken error
      else if (errorMessage.toLowerCase().includes('email has already been taken') ||
        (errorMessage.toLowerCase().includes('email') && errorMessage.toLowerCase().includes('taken'))) {
        setFormErrors({ email: 'This email is already registered' });
        showNotification('This email address is already registered. Please use a different email address.', 'error');
      }
      // Check if it's any email error
      else if (errorMessage.toLowerCase().includes('email error:')) {
        const emailMessage = errorMessage.replace('email error:', '').trim();
        setFormErrors({ email: emailMessage });
        showNotification(`Email issue: ${emailMessage}`, 'error');
      }
      // Check if it's a validation error
      else if (errorMessage.toLowerCase().includes('validation error:')) {
        const validationMessage = errorMessage.replace('validation error:', '').trim();
        showNotification(`Validation issue: ${validationMessage}`, 'error');
      }
      // Check if it's an email validation error (legacy)
      else if (errorMessage.toLowerCase().includes('email')) {
        setFormErrors({ email: 'Please enter a valid email address' });
        showNotification('Please enter a valid email address and try again.', 'error');
      }
      // Check if it's a phone validation error (legacy)
      else if (errorMessage.toLowerCase().includes('phone')) {
        setFormErrors({ phone: 'Please enter a valid phone number' });
        showNotification('Please enter a valid phone number and try again.', 'error');
      }
      else {
        // Generic error
        showNotification('Failed to create customer. Please check your information and try again.', 'error');
      }
    } finally {
      setIsCreatingCustomer(false);
    }
  };

  // Function to show notifications
  const showNotification = (message, type = 'error', duration = 5000) => {
    setNotification({ message, type });

    // Auto-hide notification after duration
    setTimeout(() => {
      setNotification(null);
    }, duration);
  };

  // Function to handle email input change and clear validation
  const handleEmailChange = (e) => {
    const newEmail = e.target.value;
    setUserDetails({ ...userDetails, email: newEmail });

    // Clear any custom validity messages
    if (e.target.setCustomValidity) {
      e.target.setCustomValidity('');
    }

    // Clear form errors for email
    if (formErrors.email) {
      setFormErrors(prev => ({ ...prev, email: null }));
    }
  };

  // Function to handle first name input change and clear validation
  const handleFirstNameChange = (e) => {
    const newFirstName = e.target.value;
    setUserDetails({ ...userDetails, firstName: newFirstName });
    if (formErrors.firstName) {
      setFormErrors(prev => ({ ...prev, firstName: null }));
    }
  };

  // Function to handle last name input change and clear validation
  const handleLastNameChange = (e) => {
    const newLastName = e.target.value;
    setUserDetails({ ...userDetails, lastName: newLastName });
    if (formErrors.lastName) {
      setFormErrors(prev => ({ ...prev, lastName: null }));
    }
  };

  // Function to handle phone input change and clear validation
  const handlePhoneChange = (e) => {
    let newPhone = e.target.value;

    // If not "other" country, remove any non-phone characters as user types
    if (selectedCountry.code !== 'other') {
      // Allow only digits, spaces, hyphens, and parentheses
      newPhone = newPhone.replace(/[^0-9\s\-\(\)]/g, '');
    }

    setUserDetails({ ...userDetails, phone: newPhone });
    if (formErrors.phone) {
      setFormErrors(prev => ({ ...prev, phone: null }));
    }
  };
  const handleNextStep = () => {
    if (selectedBarcodes.length === 0) {
      showNotification('Please select at least one item before proceeding.', 'warning');
      return;
    }
    // New Flow: Show summary popup instead of going to userForm
    setShowSummaryPopup(true);
  };

  // New function to handle proceeding from summary popup to user form
  const handleSummaryConfirm = () => {
    setShowSummaryPopup(false);
    setCurrentStep('userForm');
  };

  // New function to handle closing summary popup (go back to products)
  const handleSummaryClose = () => {
    setShowSummaryPopup(false);
  };

  // Function to get current quantity for a specific barcode
  const getCurrentQuantity = (barcode) => {
    const item = selectedItems.find(item => item.barcode === barcode);
    return item ? item.quantity : 0;
  };

  // Function to handle quantity increase from product card
  const handleQuantityIncrease = (e, product) => {
    e.stopPropagation(); // Prevent card click event
    const variant = product.variants.edges[0]?.node;
    if (!variant) return;

    const currentQty = getCurrentQuantity(variant.barcode);
    const maxPerOrder = product.maxPerOrder || 10; // Default max if not specified

    if (currentQty >= maxPerOrder) {
      showNotification(`Maximum ${maxPerOrder} items allowed for this product.`, 'error');
      return;
    }

    // Check product-level quantity limits
    const maxPerProduct = getProductMaxQuantity(product);
    if (wouldExceedProductLimit(product.originalProductId, 1, maxPerProduct)) {
      const currentProductTotal = getTotalProductQuantity(product.originalProductId);
      const remaining = maxPerProduct - currentProductTotal;
      showNotification(
        t('validation.productLimitExceeded', {
          max: maxPerProduct,
          productName: product.title.split(',')[0],
          current: String(currentProductTotal),
          remaining: String(remaining)
        }),
        'error'
      );
      return;
    }

    // Check overall cart limit
    const currentTotalItems = selectedItems.reduce((total, item) => total + item.quantity, 0);
    if (currentTotalItems >= maxItemsPerOrder) {
      showNotification(`Maximum ${maxItemsPerOrder} items allowed per order.`, 'error');
      return;
    }

    // Update selectedItems
    setSelectedItems((prev) => {
      const existingIndex = prev.findIndex(item => item.barcode === variant.barcode);
      if (existingIndex !== -1) {
        const newItems = [...prev];
        newItems[existingIndex] = {
          ...newItems[existingIndex],
          quantity: newItems[existingIndex].quantity + 1
        };
        return newItems;
      }
      return prev; // This shouldn't happen since we're only increasing existing items
    });
  };

  // Function to handle quantity decrease from product card
  const handleQuantityDecrease = (e, product) => {
    e.stopPropagation(); // Prevent card click event
    const variant = product.variants.edges[0]?.node;
    if (!variant) return;

    const currentQty = getCurrentQuantity(variant.barcode);

    if (currentQty <= 1) {
      // Remove item completely (same as clicking trash)
      handleRemoveItem(e, product);
      return;
    }

    // Update selectedItems
    setSelectedItems((prev) => {
      const existingIndex = prev.findIndex(item => item.barcode === variant.barcode);
      if (existingIndex !== -1) {
        const newItems = [...prev];
        newItems[existingIndex] = {
          ...newItems[existingIndex],
          quantity: newItems[existingIndex].quantity - 1
        };
        return newItems;
      }
      return prev;
    });
  };

  // Function to handle clicking on quantity display (opens popup)
  const handleQuantityDisplayClick = (e, product) => {
    e.stopPropagation(); // Prevent card click event

    console.log(`🎯 Quantity display clicked for: "${product.title}"`);
    console.log('Event:', e);
    console.log('Current showProductPopup state:', showProductPopup);

    // Open the popup for this product
    const variant = product.variants.edges[0]?.node;
    if (!variant) {
      console.log('❌ No variant found');
      return;
    }

    console.log(`🎯 Opening popup from quantity display for: "${product.title}"`);

    setSelectedProduct(product);
    setSelectedVariant(variant);
    setSelectedQuantity(getCurrentQuantity(variant.barcode)); // Set to current quantity
    setCurrentImageIndex(0);
    setIsEditMode(true); // Set edit mode when opening from quantity display
    setShowProductPopup(true);

    console.log('✅ Popup should now be open');
    console.log('🔍 Edit mode set to:', true);
    console.log('🔍 Selected quantity:', getCurrentQuantity(variant.barcode));
  };

  // Function to handle item removal from product card
  const handleRemoveItem = (e, product) => {
    e.stopPropagation(); // Prevent card click event
    const variant = product.variants.edges[0]?.node;
    if (!variant) return;

    // Check bundle validation before removal
    console.log(`🗑️ Checking removal of "${product.title}"`);

    // Check if removing this item would violate bundle rules
    const remainingItems = selectedItems.filter((item) => item.barcode !== variant.barcode);
    const remainingNonBundleItems = remainingItems.filter(item => {
      const itemProduct = allProducts.find(p =>
        p.variants.edges.some(edge => edge.node.barcode === item.barcode)
      );
      return !itemProduct?.bundleOnly;
    });
    const remainingBundleItems = remainingItems.filter(item => {
      const itemProduct = allProducts.find(p =>
        p.variants.edges.some(edge => edge.node.barcode === item.barcode)
      );
      return itemProduct?.bundleOnly;
    });

    if (remainingBundleItems.length > 0 && remainingNonBundleItems.length === 0) {
      // Automatically remove all bundle items as well (no confirmation needed)
      console.log(`🗑️ Auto-removing bundle items along with "${product.title}"`);

      setSelectedItems(remainingNonBundleItems);
      setSelectedBarcodes(prev => prev.filter(barcode => {
        const isBundle = remainingBundleItems.some(item => item.barcode === barcode);
        const isCurrentItem = barcode === variant.barcode;
        return !isBundle && !isCurrentItem;
      }));
    } else {
      // Just remove this item
      setSelectedItems(remainingItems);
      setSelectedBarcodes(prev => prev.filter(barcode => barcode !== variant.barcode));
    }
  };

  // New function to create wishlist and show QR code (extracted from handleWishlistComplete)
  const createWishlistAndShowQR = async (providedCustomerId = null) => {
    setIsCreatingOrder(true);

    try {
      // Create wishlist draft with customer and products
      const actualCustomerId = providedCustomerId || userDetails.customerId;
      const extractedCustomerId = actualCustomerId?.split('/').pop();
      console.log('🔍 Debug customer ID extraction:');
      console.log('  Provided customerId:', providedCustomerId);
      console.log('  UserDetails customerId:', userDetails.customerId);
      console.log('  Actual customerId:', actualCustomerId);
      console.log('  Extracted customerId:', extractedCustomerId);

      const requestBody = {
        customer: {
          customerId: extractedCustomerId || actualCustomerId // Only send the numeric customer ID
        },
        products: selectedItems.map(item => ({
          id: item.variantId,
          variantId: item.variantId,
          quantity: item.quantity,
          barcode: item.barcode
        })),
        source: "kiosk"
      };

      console.log('Draft order request body:', requestBody);
      console.log('Customer ID being sent:', actualCustomerId);

      const wishlistResponse = await fetch("/api/public/draft-orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Public-Request": "true"
        },
        body: JSON.stringify(requestBody)
      });

      if (!wishlistResponse.ok) {
        const errorData = await wishlistResponse.json().catch(() => ({}));
        throw new Error(`Failed to create wishlist: ${errorData.error || 'Unknown error'}`);
      }

      const wishlistData = await wishlistResponse.json();
      console.log('Wishlist created:', wishlistData);

      setDraftOrder(wishlistData.draftOrder);

      // Generate QR code with complete product information 
      if (wishlistData.draftOrder?.id) {
        try {
          console.log('Starting QR code generation...');
          console.log('QRCode library loaded:', !!QRCode);

          // Generate ultra-compact QR code - array format for minimal size
          const customerId = userDetails.customerId || wishlistData.draftOrder.customer?.id?.split('/').pop();
          let qrCodeData;
          if (customerId) {
            qrCodeData = {
              p: selectedItems.map(item => ({
                v: item.variantId?.split('/').pop() || item.barcode,
                q: item.quantity || 1
              })),
              c: customerId
            };
          } else {
            // No customer: use array format
            qrCodeData = selectedItems.map(item => {
              const variantId = item.variantId?.split('/').pop() || item.barcode;
              const quantity = item.quantity || 1;
              return quantity === 1 ? variantId : [variantId, quantity];
            });
          }

          console.log('Ultra-compact QR code data:', qrCodeData);
          console.log('Original vs Compact size:', {
            original: JSON.stringify({
              draftOrderId: wishlistData.draftOrder.id,
              products: selectedItems,
              customer: { id: customerId }
            }).length,
            compact: JSON.stringify(qrCodeData).length,
            reduction: Math.round((1 - JSON.stringify(qrCodeData).length / JSON.stringify({
              draftOrderId: wishlistData.draftOrder.id,
              products: selectedItems,
              customer: { id: customerId }
            }).length) * 100) + '%'
          });

          const qrCodeDataUrl = await QRCode.toDataURL(JSON.stringify(qrCodeData), {
            errorCorrectionLevel: 'M',
            type: 'image/png',
            quality: 0.92,
            margin: 1,
            color: {
              dark: '#000000',
              light: '#E5E5E5'
            },
            width: 280
          });

          console.log('QR code generated successfully, data URL length:', qrCodeDataUrl.length);
          setBarcodeDataUrl(qrCodeDataUrl);
        } catch (qrError) {
          console.error('Failed to generate QR code:', qrError);
          console.error('QR Error details:', {
            name: qrError.name,
            message: qrError.message,
            stack: qrError.stack,
            data: qrCodeData
          });
          alert('Wishlist created successfully, but failed to generate QR code. Please try again.');
          return;
        }
      }

      // Move to QR code page
      setCurrentStep('qrCode');

    } catch (error) {
      console.error('Failed to create wishlist:', error);
      alert(`Failed to create wishlist: ${error.message}`);
    } finally {
      setIsCreatingOrder(false);
    }
  };

  // New function to handle back navigation
  const handleBackToProducts = () => {
    setCurrentStep('products');
  };

  // New function to handle back from summary to form
  const handleBackToUserForm = () => {
    setCurrentStep('userForm');
  };

  const handleWishlistComplete = async () => {
    // This function is now used only in the old summary page flow (if any)
    // The new flow uses createWishlistAndShowQR() directly
    await createWishlistAndShowQR();
  };

  const handleUserFormClose = () => {
    setCurrentStep('products');
  };

  const clearList = () => {
    setSelectedBarcodes([]);
    setSelectedItems([]);
    setShowOrderCompleteModal(false);
    setShowSummaryPopup(false); // Reset summary popup state
    setDraftOrder(null);
    setBarcodeDataUrl(null);
    setCurrentStep('products');
  };

  const clearUserDetails = () => {
    setUserDetails({
      email: '',
      firstName: '',
      lastName: '',
      phone: '',
      customerId: null,
      customFields: {
        region: '',
        gender: '',
        interests: '',
        referralSource: '',
        newsletter: false
      },
      privacyAgreed: false
    });
    setFormErrors({}); // Clear any form errors
    setSelectedCountry(countries.find(c => c.code === '+852') || countries.find(c => c.code !== 'other')); // Reset to default Hong Kong
    setDraftOrder(null);
    setBarcodeDataUrl(null);
    setCurrentStep('products');
  };

  // Function to start over from QR code page
  const handleStartOver = () => {
    setSelectedBarcodes([]);
    setSelectedItems([]);
    setUserDetails({
      email: '',
      firstName: '',
      lastName: '',
      phone: '',
      customerId: null,
      customFields: {
        region: '',
        gender: '',
        interests: '',
        referralSource: '',
        newsletter: false
      },
      privacyAgreed: false
    });
    setFormErrors({}); // Clear any form errors
    setSelectedCountry(countries.find(c => c.code === '+852') || countries.find(c => c.code !== 'other')); // Reset to default Hong Kong
    setDraftOrder(null);
    setBarcodeDataUrl(null);
    setCurrentStep('products');
  };

  // Generate QR code data (ultra-compact format)
  const generateQRData = () => {
    // Ultra-compact format: just array of variant IDs/barcodes
    // Format: ["barcode1", "barcode2", ["barcode3", 2]] where 2 is quantity > 1
    const qrData = selectedBarcodes.map(barcode => {
      // For this simple case, quantity is always 1, so just return the barcode
      return barcode;
    });

    console.log('Generated compact QR data:', qrData);
    console.log('Size reduction:', {
      original: JSON.stringify({
        products: selectedBarcodes.map(barcode => ({ id: barcode, quantity: 1 })),
        customer: { name: `${userDetails.firstName} ${userDetails.lastName}`.trim(), email: userDetails.email }
      }).length,
      compact: JSON.stringify(qrData).length
    });

    return JSON.stringify(qrData);
  };

  return (
    <>
      {/* Notification Component */}
      {notification && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            padding: '16px 24px',
            borderRadius: '12px',
            color: 'white',
            fontWeight: '500',
            fontSize: '14px',
            maxWidth: '90vw',
            width: 'auto',
            textAlign: 'center',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.2)',
            animation: 'slideDown 0.3s ease-out',
            background: notification.type === 'error' ? 'linear-gradient(135deg, #dc3545, #b02a37)' :
              notification.type === 'warning' ? 'linear-gradient(135deg, #ffc107, #e0a800)' :
                notification.type === 'success' ? 'linear-gradient(135deg, #28a745, #1e7e34)' :
                  'linear-gradient(135deg, #6c757d, #545b62)',
            border: notification.type === 'error' ? '1px solid #dc3545' :
              notification.type === 'warning' ? '1px solid #ffc107' :
                notification.type === 'success' ? '1px solid #28a745' :
                  '1px solid #6c757d'
          }}
          onClick={() => setNotification(null)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
            {notification.type === 'error' && <span>⚠️</span>}
            {notification.type === 'warning' && <span>⚠️</span>}
            {notification.type === 'success' && <span>✅</span>}
            <span>{notification.message}</span>
            <button
              onClick={() => setNotification(null)}
              style={{
                background: 'none',
                border: 'none',
                color: 'white',
                cursor: 'pointer',
                padding: '0',
                marginLeft: '8px',
                fontSize: '16px',
                opacity: 0.8
              }}
            >
              ×
            </button>
          </div>
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700;900&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700&display=swap');
        
        /* CSS Variables for Brand Colors and Design System */
        :root {
          /* Primary Brand Colors */
          --color-brand-primary: #ff3333;
          --color-brand-primary-hover: #cc2929;
          --color-brand-primary-light: #ff6666;
          
          /* Background Colors */
          --color-background-primary: #000000;
          --color-background-secondary: #1a1a1a;
          --color-background-tertiary: #2a2a2a;
          
          /* Text Colors */
          --color-text-primary: #ffffff;
          --color-text-secondary: #ccc;
          --color-text-muted: #8A8A8A;
          --color-text-accent: #BBB3B6;
          
          /* Border Colors */
          --color-border-primary: #444;
          --color-border-secondary: #666;
          --color-border-light: #E9E9E9;
          
          /* Status Colors */
          --color-success: #34A853;
          --color-error: #ef4444;
          --color-warning: #f59e0b;
          
          /* UI Element Colors */
          --color-ui-background: #f6f6f7;
          --color-ui-background-alt: #F0F0F0;
          --color-ui-background-disabled: #C0C0C0;
          
          /* Overlay Colors */
          --color-overlay-dark: rgba(0, 0, 0, 0.9);
          --color-overlay-light: rgba(255, 255, 255, 0.1);
          --color-overlay-brand: rgba(255, 51, 51, 0.1);
          --color-overlay-brand-border: rgba(255, 51, 51, 0.3);
          
          /* Shadow Colors */
          --shadow-brand: 0 8px 25px rgba(255, 51, 51, 0.4);
          --shadow-brand-hover: 0 12px 35px rgba(255, 51, 51, 0.6);
          --shadow-subtle: 0 8px 10px 0 rgba(0, 0, 0, 0.10);
          --shadow-medium: 0 4px 12px rgba(0, 0, 0, 0.15);
          
          /* Brand Accent Color */
          --color-brand-accent: #7F0716;
          
          /* QR Code Colors */
          --color-qr-dark: #000000;
          --color-qr-light: #E5E5E5;
          
          /* Font Families */
          --font-primary: 'Instrument Sans', sans-serif;
          --font-secondary: 'Roboto', sans-serif;
          --font-mono: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
          
          /* Font Sizes */
          --font-size-xs: 12px;
          --font-size-sm: 14px;
          --font-size-md: 16px;
          --font-size-lg: 18px;
          --font-size-xl: 22px;
          --font-size-xxl: 28px;
          --font-size-hero: 64px;
          
          /* Spacing */
          --spacing-xs: 5px;
          --spacing-sm: 10px;
          --spacing-md: 15px;
          --spacing-lg: 20px;
          --spacing-xl: 30px;
          
          /* Border Radius */
          --radius-sm: 8px;
          --radius-md: 10px;
          --radius-lg: 15px;
          --radius-xl: 20px;
          --radius-round: 25px;
          --radius-circle: 50%;
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        @keyframes slideDown {
          0% {
            opacity: 0;
            transform: translateX(-50%) translateY(-20px);
          }
          100% {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
        
        @keyframes fadeIn {
          0% { opacity: 0; transform: translateY(20px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        
        * {
          box-sizing: border-box;
        }
        
        body {
          margin: 0;
          padding: 0;
          font-family: 'Instrument Sans', sans-serif;
        }
        
        .body-top-container {
                 background: var(--color-background-primary);
                 width: 100%;
                display: flex;
                justify-content: center;
        }

        .kiosk-container {
   
          min-height: 100vh;
          padding: 10px;
          color: white;
          position: relative;
          overflow-x: hidden;
          font-family: 'Instrument Sans', sans-serif;
          width: 100%;

        }

        .products-page {
          max-width: 1000px;
          padding: 0px 15px;
          margin: 0 auto;
        }

        @media (min-width: 768px) {
          .kiosk-container {
            padding: 20px;
          }
          
          .products-page {
            padding: 0px 50px;
          }
        }

        /* Additional responsive improvements */
        @media (max-width: 480px) {
          .product-grid {
            gap: 12px;
          }
          
          .kiosk-container {
            padding: 8px;
          }
          
          .products-page {
            padding: 0px 8px;
          }
        }

        .back-button {
          position: fixed;
          top: 15px;
          left: 15px;
          background: rgba(255, 255, 255, 0.1);
          color: white;
          border: 1px solid rgba(255, 255, 255, 0.3);
          padding: 8px 16px;
          border-radius: 25px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 500;
          transition: all 0.3s ease;
          font-family: 'Instrument Sans', sans-serif;
          z-index: 1000;
        }

        @media (min-width: 768px) {
          .back-button {
            top: 30px;
            left: 30px;
            padding: 12px 20px;
            font-size: 14px;
          }
        }

        .back-button:hover {
          background: rgba(255, 255, 255, 0.2);
          transform: translateY(-2px);
        }

        .step-container {
          width: 100%;
          min-height: calc(100vh - 40px);
        }

        .user-form-container {
          max-width: 700px;
          margin: 0 auto;
          padding: 0px 15px;
        }

        @media (min-width: 768px) {
          .user-form-container {
            padding: 0px 20px;
          }
        }

        .form-header {
          color: white;
          font-size: 24px;
          font-weight: 600;
          margin-bottom: 15px;
          text-align: left;
        }

        .form-subheader {
          color: #ccc;
          font-size: 16px;
          margin-bottom: 30px;
          text-align: left;
          font-weight: 400;
        }

        @media (min-width: 768px) {
          .form-header {
            font-size: 32px;
          }
          
          .form-subheader {
            font-size: 18px;
            margin-bottom: 40px;
          }
        }

        .form-input-container {
          position: relative;
          margin-bottom: 25px;
        }

        .form-input {
          width: 100%;
          padding: 20px 20px 8px 20px;
          border: 2px solid #444;
          border-radius: 15px;
          font-size: 16px;
          background: transparent;
          color: white;
          outline: none;
          font-family: 'Instrument Sans', sans-serif;
          transition: border-color 0.3s ease;
          height: 48px;
          box-sizing: border-box;
        }

        .form-input:focus {
          border-color: #666;
        }

        .form-input::placeholder {
          color: transparent;
        }

        .form-label {
          position: absolute;
          left: 20px;
          top: 14px;
          color: #8A8A8A;
          font-size: 16px;
          font-family: 'Instrument Sans', sans-serif;
          transition: all 0.3s ease;
          pointer-events: none;
          background: transparent;
        }

        .form-input:focus + .form-label,
        .form-input:not(:placeholder-shown) + .form-label {
          top: 4px;
          font-size: 12px;
          color: #8A8A8A;
        }

        .phone-container {
          display: flex;
          gap: 10px;
          margin-bottom: 25px;
          position: relative;
        }

        .country-select {
          width: 120px;
          padding: 0 10px;
          border: 2px solid #444;
          border-radius: 15px;
          background: transparent;
          color: white;
          outline: none;
          font-size: 16px;
          font-family: 'Instrument Sans', sans-serif;
          cursor: pointer;
          height: 48px;
          box-sizing: border-box;
        }

        .form-button {
          width: 100%;
          padding: 0 24px;
          border: 1px solid #E9E9E9;
          border-radius: 99999px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          margin-bottom: 20px;
          font-family: 'Instrument Sans', sans-serif;
          transition: all 0.3s ease;
          height: 48px;
          background: #FFF;
          color: black;
        }

        .next-btn {
          background: #FFF;
          color: black;
        }

        .next-btn:hover:not(:disabled) {
          background: #F0F0F0;
        }

        .next-btn:disabled {
          background: #C0C0C0;
          opacity: 0.5;
          cursor: not-allowed;
        }

        .form-back-link {
          text-align: center;
          color: white;
          font-size: 16px;
          cursor: pointer;
          text-decoration: none;
        }

        .form-back-link:hover {
          text-decoration: underline;
        }

        .privacy-checkbox-container {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 25px;
          background: transparent;
        }

        .privacy-checkbox {
          width: 20px;
          height: 20px;
          accent-color: var(--color-brand-primary);
          cursor: pointer;
          flex-shrink: 0;
          margin-top: 2px;
        }

        .privacy-text {
          color: #ccc;
          font-size: 14px;
          line-height: 1.4;
          font-family: 'Instrument Sans', sans-serif;
        }

        .privacy-text a {
          color: #ff3333;
          text-decoration: underline;
        }

        .privacy-text a:hover {
          color: #cc2929;
        }

        .qr-code-container {
          max-width: 600px;
          margin: 0 auto;
          padding: 20px 15px;
          text-align: center;
        }

        @media (min-width: 768px) {
          .qr-code-container {
            padding: 40px 20px;
          }
        }

        .wishlist-summary {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 20px;
          padding: 30px;
          margin-bottom: 30px;
        }

        .summary-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 15px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .summary-item:last-child {
          border-bottom: none;
        }

        .summary-page-container {
          max-width: 700px;
          margin: 0 auto;
          padding: 20px 15px;
        }

        @media (min-width: 768px) {
          .summary-page-container {
            padding: 40px 20px;
          }
        }

        .summary-card {
          background: transparent;
          border: 1px solid #555;
          border-radius: 20px;
          padding: 15px 15px;
          margin-bottom: 30px;
        }

        .summary-header {
          color: #ECEAEA;
          font-size: 20px;
          font-weight: 600;
          margin-bottom: 15px;
          text-align: left;
        }

        .summary-subheader {
          color: #ECEAEA;
          font-size: 14px;
          margin-bottom: 25px;
          text-align: left;
          line-height: 1.4;
        }

        @media (min-width: 768px) {
          .summary-header {
            font-size: 24px;
            margin-bottom: 20px;
          }
          
          .summary-subheader {
            font-size: 16px;
            margin-bottom: 30px;
          }
        }

        .items-summary {
          margin-bottom: 20px;
        }

        .items-header {
          display: flex;
          justify-content: space-between;
          color: #BBB3B6;
          font-size: 12px;
          font-weight: 600;
          margin-bottom: 15px;
          letter-spacing: 0.5px;
        }

        .summary-total {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 20px;
          border-top: 1px solid #555;
          color: #ECEAEA;
          font-size: 20px;
          font-weight: 700;
        }

        .create-wishlist-btn {
          width: 100%;
          background: white;
          color: #111;
          border: none;
          padding: 0 18px;
          border-radius: 30px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          margin-bottom: 20px;
          height: 48px;
        }

        .create-wishlist-btn:hover {
          background: #f0f0f0;
          transform: translateY(-2px);
        }

        .back-link {
          color: #ECEAEA;
          text-decoration: none;
          font-size: 16px;
          text-align: center;
          display: block;
          cursor: pointer;
        }

        .back-link:hover {
          text-decoration: underline;
        }
        
        .header-section {
          text-align: center;
          margin-bottom: 10px;
          animation: fadeIn 0.8s ease-out;
        }
        
        .aoo-logo {
          margin-bottom: 20px;
        }
        
        .brand-title {
          margin-bottom: 10px;
        }
        
        .complex-text {
          color: var(--color-brand-primary);
          font-weight: 900;
          font-size: 28px;
          letter-spacing: 1px;
          text-transform: uppercase;
        }
        
        .presents-text {
          color: #666;
          font-weight: 300;
          font-size: 16px;
          margin-left: 10px;
          text-transform: uppercase;
          letter-spacing: 2px;
        }
        
        .rubify-text {
          font-size: 40px;
          font-weight: 300;
          color: var(--color-brand-primary);
          font-style: italic;
          margin: 15px 0;
          text-shadow: 0 0 20px rgba(255, 51, 51, 0.3);
        }

        @media (min-width: 768px) {
          .rubify-text {
            font-size: 64px;
            margin: 20px 0;
          }
        }
        
        .text-section {
          text-align: left;
        }
        
        .subtitle {
          color: #ECEAEA;
          font-size: 20px;
          font-weight: 300;
          margin-bottom: 8px;
          text-align: left;
        }
        
        .description {
          color: #ECEAEA;
          font-size: 14px;
          max-width: 600px;
          margin: 0 0 20px 0;
          line-height: 1.5;
          text-align: left;
        }

        @media (min-width: 768px) {
          .subtitle {
            font-size: 24px;
            margin-bottom: 10px;
          }
          
          .description {
            font-size: 16px;
            margin: 0 0 24px 0;
          }
        }
        
        .category-buttons {
          display: flex;
          gap: 10px;
          justify-content: left;
          margin-top: 15px;
          margin-bottom: 8px;
          overflow-x: auto;
          padding: 0px 0px 0px 0px;
          scroll-behavior: smooth;
          -webkit-overflow-scrolling: touch;
          flex-wrap: wrap;
        }

        @media (min-width: 768px) {
          .category-buttons {
            gap: 15px;
            margin-top: 20px;
            margin-bottom: 10px;
          }
        }
        
        /* Remove media query that centers category-buttons on larger screens */
        
        .category-btn {
          background: white;
          color: #333;
          border: none;
          padding: 0px 16px;
          border-radius: 25px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s ease;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          flex-shrink: 0;
          white-space: nowrap;
          font-family: 'Instrument Sans', sans-serif;
          position: relative;
          height: 28px;
          text-align: center;
          font-family: "Instrument Sans";
          font-style: normal;
          font-weight: 700;
          line-height: 10px; /* 83.333% */
          letter-spacing: 0.84px;
          text-transform: uppercase;
          top: 0;
        }

        @media (min-width: 768px) {
          .category-btn {
            padding: 0px 24px;
            font-size: 12px;
            height: 34px;
          }
        }
        
        .category-btn:hover {
          background: #f0f0f0;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }
        
        .category-btn.active {
          background: #ff3333;
          color: white;
          box-shadow: 0 4px 12px rgba(255, 51, 51, 0.3);
        }
        
        .category-btn.active:hover {
          background: #cc2929;
        }
        
        .product-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 15px;
          max-width: 1200px;
          margin: 0 auto;
          animation: fadeIn 1s ease-out 0.3s both;
        }

        @media (min-width: 768px) {
          .product-grid {
            grid-template-columns: repeat(3, 1fr);
            gap: 24px;
          }
        }
        
        .product-card {
          background: transparent;
          border-radius: 20px;
          padding: 0px;
          cursor: pointer;
          transition: all 0.3s ease;
          border: 2px solid transparent;
          position: relative;
          overflow: hidden;
          display: flex;
          width: 100%;
          max-width: 290px;
          height: auto;
          min-height: 300px;
          flex-direction: column;
          margin: 0 auto;
        }

        @media (min-width: 768px) {
          .product-card {
            max-width: 290px;
            min-height: 411px;
          }
        }
        

        .product-card:hover .product-title,
        .product-card:hover .product-price,
        .product-card:hover .product-status {
          text-decoration: underline;
          text-underline-offset: 4px;
        }
        
        .product-card.selected {
          background: transparent;
        }

        .product-image-container.selected {
          border: 3px solid #FBFBFB;
        }

        .product-image-container .product-checkmark {
          position: absolute;
          top: 0px;
          right: 0px;
          z-index: 4;
          width: 45px;
          height: 45px;
          pointer-events: none;
          display: flex;
          padding: 8px;
          justify-content: center;
          align-items: center;
          gap: 10px;
          border-radius: 0 12px 0 12px;
          background: #FFF;
          box-shadow: 0 8px 10px 0 rgba(0, 0, 0, 0.15);
        }

        .quantity-controls {
          position: absolute;
          top: 0px;
          right: 0px;
          z-index: 4;
          display: flex;
          align-items: center;
          background: rgba(255, 255, 255, 1);
          border-radius: 0 12px 0 8px;
          padding: 2px;
          gap: 1px;
          width: auto;
          min-width: 75px;
          height: 35px;
        }

        .quantity-btn {
          background: transparent;
          border: none;
          outline: none;
          padding: 3px;
          border-radius: 3px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background-color 0.15s;
          color: #000;
          min-width: 14px;
          height: 14px;
        }

        .quantity-btn:hover {
          background: rgba(0, 0, 0, 0.08);
        }

        .quantity-btn:active {
          background: rgba(0, 0, 0, 0.15);
        }

        .quantity-btn:focus {
          outline: none;
          border: none;
        }

        .quantity-btn svg {
          width: 10px;
          height: 10px;
          stroke: #000;
          stroke-width: 2.5;
        }

        /* Separate styles for inline quantity controls */
        .inline-quantity-btn {
          background: transparent;
          border: none;
          outline: none;
          padding: 6px;
          border-radius: 6px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background-color 0.15s;
          color: #000;
          width: 28px;
          height: 28px;
          flex-shrink: 0;
        }

        .inline-quantity-btn:hover {
          background: rgba(0, 0, 0, 0.08);
        }

        .inline-quantity-btn:active {
          background: rgba(0, 0, 0, 0.15);
        }

        .inline-quantity-btn:focus {
          outline: none;
          border: none;
        }

        .inline-quantity-btn svg {
          width: 18px;
          height: 18px;
          stroke: #000;
          stroke-width: 2.5;
        }

        /* Red bin icon for delete */
        .inline-quantity-btn.quantity-decrease svg {
          stroke: #dc2626;
        }

        .quantity-display {
          font-size: 11px;
          font-weight: 700;
          color: #000;
          min-width: 5px;
          text-align: center;
          line-height: 1;
          cursor: pointer;
          padding: 1px 2px;
          border-radius: 2px;
          transition: background-color 0.15s;
        }

        .quantity-display:hover {
          background: rgba(0, 0, 0, 0.05);
        }

        /* Separate styles for inline quantity display */
        .inline-quantity-display {
          font-size: 13px;
          font-weight: 700;
          color: #000;
          text-align: center;
          line-height: 1;
          cursor: pointer;
          padding: 2px 4px;
          border-radius: 3px;
          border: none;
          outline: none;
          transition: background-color 0.15s;
          flex-grow: 1;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .inline-quantity-display:hover {
          background: rgba(0, 0, 0, 0.05);
        }

        .inline-quantity-display:focus {
          outline: none;
          border: none;
        }

        @media (min-width: 768px) {
          .quantity-controls {
            width: auto;
            min-width: 90px;
            height: 42px;
            padding: 3px;
            gap: 2px;
          }

          .quantity-btn {
            padding: 4px;
            min-width: 16px;
            height: 16px;
          }

          .quantity-btn svg {
            width: 12px;
            height: 12px;
          }

          .inline-quantity-btn {
            padding: 8px;
            width: 36px;
            height: 36px;
          }

          .inline-quantity-btn svg {
            width: 22px;
            height: 22px;
          }

          .quantity-display {
            font-size: 12px;
            min-width: 12px;
            padding: 2px 3px;
          }

          .inline-quantity-display {
            font-size: 15px;
            padding: 3px 5px;
          }

          .product-image-container .product-checkmark {
            width: 60px;
            height: 60px;
            padding: 10px;
          }
        }
        
        .product-card.unavailable {
          opacity: 0.6;
          cursor: not-allowed;
          position: relative;
        }
        
        .product-card.unavailable .product-image-container::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(135deg, rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.3) 50%, rgba(0, 0, 0, 0.6) 100%);
          border-radius: 24px;
          z-index: 1;
          pointer-events: none;
        }
        
        .product-card.unavailable .product-image-container::after {
          content: 'SOLD OUT';
          position: absolute;
          bottom: 10px;
          left: 50%;
          transform: translateX(-50%);
          border-radius: 16px;
          border: 0.5px solid #E9E9E9;
          background: #222;
          box-shadow: 0 8px 10px 0 rgba(0, 0, 0, 0.10);
          color: #FFF;
          text-align: center;
          font-family: "Instrument Sans";
          font-size: 14px;
          font-style: normal;
          font-weight: 700;
          line-height: 10px;
          letter-spacing: 0.98px;
          text-transform: uppercase;
          padding: 10px;
          white-space: nowrap;
          z-index: 3;
          pointer-events: all;
        }
        
        .product-image-container {
          width: 100%;
          aspect-ratio: 1;
          border-radius: 24px;
          border: 1px solid #888888;
          background: #EAEAEA;
          border-radius: 24px;
          box-shadow: 2px 3px 6px 0px rgb(56 56 56);
          overflow: hidden;
          margin-bottom: 15px;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          background: #FFFFFF;
        }
        
        .size-bubble {
          display: flex;
          flex-direction: row;
          justify-content: center;
          align-items: center;
          padding: 6px;
          gap: 6px;
          position: absolute;
          width: 30px;
          height: 30px;
          left: 6px;
          top: 5px;
          background: rgba(0, 0, 0, 0.8);
          border: 0.5px solid #E9E9E9;
          box-shadow: 0px 8px 10px rgba(0, 0, 0, 0.1);
          border-radius: 99px;
          flex: none;
          order: 3;
          flex-grow: 0;
          z-index: 2;
        }
        
        .size-bubble-text {
          font-family: 'Instrument Sans';
          font-style: normal;
          font-weight: 700;
          font-size: 14px;
          line-height: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          color: #FFFFFF;
          white-space: nowrap;
          width: 100%;
          height: 100%;
        }
        
        .product-image {
          width: 90%;
          height: 90%;
          object-fit: cover;
          transition: transform 0.3s ease;
          background: #FFFFFF;
        }
        
        .product-card:hover .product-image {
          transform: scale(1.10);
        }
        
        .product-title {
          color: #BBB3B6;
          font-size: 14px;
          font-weight: 400;
          margin-bottom: 8px;
          text-align: center;
          line-height: 1.3;
          font-family: 'Instrument Sans', sans-serif;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 5px;
        }
        
        .bundle-badge {
          background: rgba(255, 165, 0, 0.2);
          color: #FFA500;
          border: 1px solid rgba(255, 165, 0, 0.5);
          font-size: 10px;
          font-weight: 600;
          padding: 3px 8px;
          border-radius: 12px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          font-family: 'Instrument Sans', sans-serif;
          white-space: nowrap;
          margin-top: 2px;
        }
        
        .product-price {
          color: white;
          font-size: 16px;
          font-weight: 400;
          text-align: center;
          margin-bottom: 5px;
          font-family: 'Instrument Sans', sans-serif;
        }

        @media (min-width: 768px) {
          .product-title {
            font-size: 16px;
            margin-bottom: 10px;
          }
          
          .product-price {
            font-size: 18px;
          }
        }
        
        .product-status {
          text-align: center;
          font-size: 14px;
          font-weight: 500;
          letter-spacing: 0.5px;
          font-family: 'Instrument Sans', sans-serif;
        }
        
        .status-available {
          color: #34A853;
          text-align: center;
          font-family: "Instrument Sans";
          font-size: 16px;
          font-style: normal;
          font-weight: 500;
          line-height: 16px; /* 100% */
        }

        .remaining-quantity {
          font-size: 12px;
          color: #666;
          margin-top: 2px;
          font-weight: 400;
        }
        
        .status-unavailable {
          color: #ef4444;
          font-family: "Instrument Sans", sans-serif;
        }
        
        .bundle-availability-note {
          color: #BBB3B6;
          text-align: center;
          font-family: "Instrument Sans", sans-serif;
          font-size: 11px;
          font-weight: 400;
          line-height: 1.2;
          margin-top: 3px;
          opacity: 0.8;
        }
        
        @media (min-width: 768px) {
          .bundle-availability-note {
            font-size: 12px;
          }
        }
        
        .floating-cart {
          position: fixed;
          bottom: 20px;
          right: 20px;
          background: #ff3333;
          color: white;
          border: none;
          width: 50px;
          height: 50px;
          border-radius: 50%;
          box-shadow: 0 8px 25px rgba(255, 51, 51, 0.4);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          z-index: 1000;
          transition: all 0.3s ease;
        }

        @media (min-width: 768px) {
          .floating-cart {
            bottom: 30px;
            right: 30px;
            width: 70px;
            height: 70px;
            font-size: 24px;
          }
        }
        
        .floating-cart:hover {
          transform: scale(1.1);
          box-shadow: 0 12px 35px rgba(255, 51, 51, 0.6);
        }
        
        .cart-count {
          position: absolute;
          top: -8px;
          right: -8px;
          background: white;
          color: #ff3333;
          border-radius: 50%;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: bold;
        }
        
        /* Product Popup Modal Styles */
        .product-popup-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.9);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2000;
          padding: 20px;
        }
        
        .product-popup {
          background: var(--color-background-primary);
          border-radius: 25px;
          width: 100%;
          max-width: 480px;
          max-height: 90vh;
          overflow-y: auto;
          position: relative;
          border: 1px solid #444;
        }
        
        .popup-header {
          text-align: center;
          padding: 25px 60px 15px 25px;
        }
        
        .popup-title {
          color: white;
          font-family: 'Instrument Sans', sans-serif;
          font-size: 24px;
          font-weight: 600;
          margin: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }
        
        .popup-bundle-badge {
          background: rgba(255, 165, 0, 0.2);
          color: #FFA500;
          border: 1px solid rgba(255, 165, 0, 0.5);
          font-size: 12px;
          font-weight: 600;
          padding: 4px 12px;
          border-radius: 15px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          font-family: 'Instrument Sans', sans-serif;
        }
        
        .popup-close {
          position: absolute;
          top: 20px;
          right: 20px;
          background: none;
          border: none;
          color: #888;
          font-size: 28px;
          cursor: pointer;
          padding: 0;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          transition: all 0.3s ease;
        }
        
        .popup-close:hover {
          background: rgba(255, 255, 255, 0.1);
          color: white;
        }
        
        .popup-content {
          padding: 15px;
        }
        
        .popup-content-inner {
          margin: 10px;
        }
        
        .popup-product-image {
          width: 100%;
          aspect-ratio: 1;
          border-radius: 20px;
          background: #FFFFFF;
          margin: 0 auto 20px auto;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          border: 1px solid #555;
          position: relative;
        }
        
        .popup-product-image img {
          width: 90%;
          height: 90%;
          object-fit: cover;
        }
        
        .image-carousel-container {
          position: relative;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .carousel-nav-container {
          display: flex;
          flex-direction: row;
          justify-content: space-between;
          align-items: center;
          padding: 0 10px;
          gap: 10px;
          isolation: isolate;
          position: absolute;
          width: calc(100% - 20px);
          height: 40px;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          flex: none;
          z-index: 2;
          pointer-events: none;
        }
        
        .carousel-nav-btn {
          display: flex;
          flex-direction: row;
          justify-content: center;
          align-items: center;
          padding: 10px;
          gap: 8px;
          width: 40px;
          height: 40px;
          background: rgba(255, 255, 255, 0.2);
          box-shadow: 0px 0px 10px 3px rgba(0, 0, 0, 0.15);
          border-radius: 16px;
          border: none;
          cursor: pointer;
          transition: all 0.3s ease;
          flex: none;
          flex-grow: 0;
          z-index: 0;
          pointer-events: auto;
        }
        
        .carousel-nav-btn:hover {
          background: rgba(255, 255, 255, 0.3);
          box-shadow: 0px 0px 15px 5px rgba(0, 0, 0, 0.2);
        }
        
        .carousel-nav-btn.prev {
          order: 0;
        }
        
        .carousel-nav-btn.next {
          order: 1;
        }
        
        .carousel-nav-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
          pointer-events: none;
        }
        
        .carousel-arrow {
          width: 20px;
          height: 20px;
          flex: none;
          order: 0;
          flex-grow: 0;
        }
        
        .carousel-arrow.left {
          transform: rotate(0deg);
        }
        
        .carousel-arrow.right {
          transform: rotate(180deg);
        }
        
        .image-dots-container {
          display: flex;
          flex-direction: row;
          align-items: flex-start;
          padding: 8px 10px;
          gap: 5px;
          position: absolute;
          width: auto;
          min-width: 45px;
          height: 26px;
          left: 50%;
          transform: translateX(-50%);
          bottom: 0px;
          flex: none;
          z-index: 3;
          background: rgba(0, 0, 0, 0.3);
          border-radius: 13px;
          backdrop-filter: blur(5px);
        }
        
        .image-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #BBB3B6;
          opacity: 0.7;
          cursor: pointer;
          transition: all 0.3s ease;
          flex: none;
          flex-grow: 0;
        }
        
        .image-dot.active {
          background: #D10000;
          opacity: 1;
          transform: none;
        }
        
        .image-dot:hover:not(.active) {
          background: #999;
        }
        
        .popup-product-title {
          color: white;
          font-family: 'Instrument Sans', sans-serif;
          font-size: 20px;
          font-weight: 500;
          text-align: center;
          margin: 0 0 10px 0;
          line-height: 1.3;
        }
        
        .popup-product-price {
          color: #ff3333;
          font-family: 'Instrument Sans', sans-serif;
          font-size: 24px;
          font-weight: 600;
          text-align: center;
          margin: 0 0 30px 0;
        }
        
        .popup-section {
          margin-bottom: 15px;
          padding: 0 5px;
        }
        
        .popup-section-title {
          color: #8A8A8A;
          font-family: 'Instrument Sans', sans-serif;
          font-size: 16px;
          font-weight: 500;
          margin: 0 0 10px 0;
          text-align: left;
        }
        
        .variant-section {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          margin: 0;
        }
        
        .variant-label {
          color: #8A8A8A;
          font-family: 'Instrument Sans', sans-serif;
          font-size: 16px;
          font-weight: 500;
          flex: none;
        }
        
        .variant-options {
          display: flex;
          flex-wrap: wrap;
          gap: 0px;
          justify-content: flex-end;
          flex: 1;
          margin-left: 20px;
          max-width: 170px;
        }
        
        .variant-option {
          background: transparent;
          border: 1px solid #ECEAEA;
          border-radius: 12px;
          padding: 0 16px;
          color: white;
          font-family: 'Instrument Sans', sans-serif;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s ease;
          white-space: nowrap;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-right: 5px;
          box-sizing: border-box;
        }
        
        .variant-option:hover {
          border-color: #ff3333;
          color: #ff3333;
        }
        
        .variant-option.selected {
          border-color: #ECEAEA;
          background: #ECEAEA;
          color: black;
        }
        
        .variant-option:disabled {
          background: #404040;
          border-color: #555555;
          color: #888888;
          cursor: not-allowed;
          opacity: 0.6;
        }
        
        .variant-option:disabled:hover {
          border-color: #555555;
          color: #888888;
        }
        
        .quantity-section {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          margin: 0;
        }
        
        .quantity-label {
          color: #8A8A8A;
          font-family: 'Instrument Sans', sans-serif;
          font-size: 16px;
          font-weight: 500;
          flex: none;
        }
        
        .quantity-container {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0px;
          width: 170px;
          height: 48px;
          margin: 0;
        }
        
        .quantity-btn {
          background: transparent;
          border: 1px solid #ECEAEA;
          border-radius: 12px;
          width: 48px;
          height: 48px;
          color: white;
          font-size: 20px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s ease;
          flex: none;
          margin: -6px;
          box-sizing: border-box;
        }
        
        .quantity-btn:first-child {

        }
        
        .quantity-btn:last-child {

        }
        
        .quantity-btn:hover:not(:disabled) {
          border-color: #ff3333;
          color: #ff3333;
        }
        
        .quantity-btn:focus {
          outline: none;
          border-color: #ff3333;
          color: #ff3333;
        }
        
        .quantity-btn:active {
          border-color: #ff3333;
          color: #ff3333;
          background: rgba(255, 51, 51, 0.1);
        }
        
        .quantity-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        /* Specific styles for popup quantity buttons to override general quantity-btn styles */
        .popup-quantity-btn {
          background: transparent !important;
          border: 1px solid #ECEAEA !important;
          border-radius: 12px;
          width: 48px;
          height: 48px;
          color: white;
          font-size: 20px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s ease;
          flex: none;
          margin: -6px;
          box-sizing: border-box;
        }
        
        .popup-quantity-btn:hover:not(:disabled) {
          border-color: #ff3333 !important;
          color: #ff3333;
        }
        
        .popup-quantity-btn:focus {
          outline: none !important;
          border-color: #ff3333 !important;
          color: #ff3333;
        }
        
        .popup-quantity-btn:active {
          border-color: #ff3333 !important;
          color: #ff3333;
          background: rgba(255, 51, 51, 0.1) !important;
        }
        
        .popup-quantity-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          border-color: #ECEAEA !important;
        }
        
        .quantity-display {
          color: white;
          font-family: 'Instrument Sans', sans-serif;
          font-size: 16px;
          font-weight: 600;
          width: 40px;
          height: 48px;
          text-align: center;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #716569;
          border-radius: 0;
          border-left: none;
          border-right: none;
          flex: none;
          margin: 0;
          box-sizing: border-box;
        }
        
        .quantity-note {
          color: #8A8A8A;
          font-family: 'Instrument Sans', sans-serif;
          font-size: 14px;
          text-align: center;
          margin-top: 10px;
        }
        
        .bundle-note {
          color: #FFA500;
          font-family: 'Instrument Sans', sans-serif;
          font-size: 14px;
          text-align: center;
          margin-top: 10px;
          padding: 8px 12px;
          background: rgba(255, 165, 0, 0.1);
          border: 1px solid rgba(255, 165, 0, 0.3);
          border-radius: 8px;
          line-height: 1.3;
        }
        
        .popup-actions {
          display: flex;
          gap: 15px;
          margin-top: 0px;
        }
        
        .popup-btn {
          flex: 1;
          padding: 0 20px;
          height: 48px;
          border-radius: 25px;
          font-family: 'Instrument Sans', sans-serif;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .popup-btn-secondary {
          background: transparent;
          border: 2px solid #444;
          color: white;
        }
        
        .popup-btn-secondary:hover {
          border-color: #666;
          background: rgba(255, 255, 255, 0.05);
        }
        
        .popup-btn-primary {
          background: white;
          border: 2px solid white;
          color: black;
        }
        
        .popup-btn-primary:hover {
          background: #f0f0f0;
        }
        
        .popup-btn-primary:disabled {
          background: #666;
          border-color: #666;
          color: #999;
          cursor: not-allowed;
        }
        
        .user-info-bar {
          background: rgba(255, 51, 51, 0.1);
          border: 1px solid rgba(255, 51, 51, 0.3);
          border-radius: 15px;
          padding: 15px 20px;
          margin-bottom: 30px;
          text-align: center;
          backdrop-filter: blur(10px);
        }
        
        .user-info-text {
          color: white;
          margin-bottom: 5px;
        }
        
        .edit-user-btn {
          background: none;
          border: none;
          color: #ff3333;
          text-decoration: underline;
          cursor: pointer;
          font-size: 12px;
        }
        
        .action-buttons {
          display: flex;
          gap: 15px;
          justify-content: center;
          margin-top: 30px;
          flex-wrap: wrap;
          width: 100%;
        }
        
        .action-btn {
          padding: 0 24px;
          border: 1px solid #E9E9E9;
          border-radius: 99999px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          font-size: 16px;
          font-family: 'Instrument Sans', sans-serif;
          width: 100%;
          max-width: 100%;
          height: 48px;
          background: #FFF;
          color: black;
        }
        
        .btn-next {
          background: #FFF;
          color: black;
        }
        
        .btn-next:hover {
          background: #F0F0F0;
        }
        
        /* Mobile sticky Next button */
        @media (max-width: 768px) {
          .action-buttons {
            position: relative;
          }
          
          .action-buttons:has(.btn-next) {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            padding: 20px;
            background: linear-gradient(to top, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0.95) 70%, rgba(0, 0, 0, 0) 100%);
            z-index: 1000;
            backdrop-filter: blur(8px);
            border-top: 1px solid rgba(255, 255, 255, 0.1);
          }
          
          .sticky-next-button {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            padding: 20px;
            background: linear-gradient(to top, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0.95) 70%, rgba(0, 0, 0, 0) 100%);
            z-index: 1000;
            backdrop-filter: blur(8px);
            border-top: 1px solid rgba(255, 255, 255, 0.1);
          }
          
          .sticky-next-button .btn-next {
            width: 100%;
            max-width: none;
            padding: 16px 20px;
            font-size: 16px;
            font-weight: 600;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
          }
          
          /* Add bottom padding to content to prevent overlap */
          .products-page {
            padding-bottom: 100px;
          }
        }
        
        .btn-clear {
          background: rgba(239, 68, 68, 0.2);
          color: #ef4444;
          border: 1px solid rgba(239, 68, 68, 0.3);
        }
        
        .btn-clear:hover {
          background: #ef4444;
          color: white;
        }
        
        .btn-clear-user {
          background: rgba(107, 114, 128, 0.2);
          color: #9ca3af;
          border: 1px solid rgba(107, 114, 128, 0.3);
        }
        
        .btn-clear-user:hover {
          background: #6b7280;
          color: white;
        }
        
        .bottom-aoo-logo {
          text-align: center;
          margin-top: 40px;
        }

        .next-button {
          position: fixed;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          background: #FFF;
          color: black;
          border: 1px solid #E9E9E9;
          padding: 0 30px;
          border-radius: 99999px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          box-shadow: 0 8px 25px rgba(192, 192, 192, 0.4);
          transition: all 0.3s ease;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          font-family: 'Instrument Sans', sans-serif;
          z-index: 1000;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        @media (min-width: 768px) {
          .next-button {
            bottom: 30px;
            padding: 0 40px;
            font-size: 16px;
            height: 48px;
          }
        }

        .next-button:hover {
          background: #F0F0F0;
          transform: translateX(-50%) translateY(-2px);
          box-shadow: 0 12px 35px rgba(255, 255, 255, 0.6);
        }

        .next-button:disabled {
          background: #C0C0C0;
          cursor: not-allowed;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }

        .page-container {
          transition: opacity 0.3s ease, transform 0.3s ease;
        }

        .page-container.hidden {
          opacity: 0;
          transform: translateY(20px);
          pointer-events: none;
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
        }
        
        .back-to-home-container {
          text-align: center;
          margin-top: 30px;
          margin-bottom: 20px;
        }
        
        .back-to-home-btn {
          display: inline-block;
          color: var(--color-text-muted);
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
          padding: 12px 24px;
          border: 1px solid var(--color-border-primary);
          border-radius: var(--radius-round);
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(10px);
          transition: all 0.3s ease;
          font-family: 'Instrument Sans', sans-serif;
        }
        
        @media (min-width: 768px) {
          .back-to-home-btn {
            font-size: 16px;
            padding: 14px 28px;
          }
        }
        
        .back-to-home-btn:hover {
          color: var(--color-text-primary);
          border-color: var(--color-brand-primary);
          background: rgba(255, 51, 51, 0.1);
          transform: translateY(-2px);
        }
      `}</style>

      <div className="body-top-container">
        <div className="kiosk-container">
          {/* Step 1: Product Selection */}
          {currentStep === 'products' && (
            <div className="step-container products-page">
              <div className="header-section">
                {/* Language Selector */}
                <div style={{
                  position: 'absolute',
                  top: '20px',
                  right: '20px',
                  zIndex: 100
                }}>
                  <LanguageSelector
                    currentLanguage={currentLanguage}
                    onLanguageChange={handleLanguageChange}
                  />
                </div>

                <div className="rubify-branding" style={{ marginTop: '20px' }}>
                  <img
                    src="/rubify-branding.png"
                    alt="Complex Presents Rubify"
                    style={{
                      width: '90%',
                      maxWidth: '350px',
                      height: 'auto',
                      aspectRatio: '400/215',
                      objectFit: 'cover',
                      objectPosition: 'center',
                    }}
                  />
                </div>

                <div className="text-section">
                  <h2 style={{ fontFamily: 'Instrument Sans, sans-serif', fontWeight: '500' }}>{t('selectProducts')}</h2>

                  {/* Instructions with bullet points */}
                  <div style={{ fontFamily: 'Instrument Sans, sans-serif', marginBottom: '20px' }}>
                    <p style={{ marginBottom: '5px', marginLeft: '5%', fontSize: '14px' }}>
                      •  {t('refreshForInventory')}
                    </p>
                    <p style={{ marginBottom: '5px', marginLeft: '5%', fontSize: '14px' }}>
                      •   {t('submitCloserToCheckout')}
                    </p>
                    <p style={{ marginBottom: '5px', marginLeft: '5%', fontSize: '14px' }}>
                      • {t('oneUnitPerItem')}
                    </p>
                    <p style={{ marginBottom: '5px', marginLeft: '5%', fontSize: '14px' }}>
                      • {t('maxFiveItems')}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center' , marginTop: '8px', marginBottom: '8px' }}>
                      <img 
                        src="/Important_Icon.png" 
                        alt="Important" 
                        style={{ width: '30px', height: '30px', marginRight: '12px', marginLeft: '0px', verticalAlign: 'middle' }}
                      />
                      <span style={{ fontWeight: '600', color: '#DD3131', fontStyle: 'italic', verticalAlign: 'middle' }}>
                        {t('importantNote')}
                      </span>
                    </div>
                    <p style={{ marginBottom: '8px', color: '#BBB3B6', fontSize: '14px' }}>
                      {t('crowdControl')}
                    </p>
                  </div>
                </div>

                <div className="category-buttons">
                  {availableCategories.map((category) => (
                    <button
                      key={category}
                      className={`category-btn ${selectedCategory === category ? 'active' : ''}`}
                      onClick={() => handleCategoryFilter(category)}
                      style={{
                        color: category === 'VISA EXCLUSIVE'
                          ? (selectedCategory === category ? 'white' : '#1434CB')
                          : undefined,
                        backgroundColor: category === 'VISA EXCLUSIVE' && selectedCategory === category
                          ? '#1434CB'
                          : undefined
                      }}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              </div>
              <div className="product-grid">{products.map((product) => {
                const variant = product.variants.edges[0]?.node; // Now each product has only one variant
                if (!variant || !variant.barcode) return null;

                // Check if this specific variant is selected
                const isProductSelected = selectedBarcodes.includes(variant.barcode);
                const currentQuantity = getCurrentQuantity(variant.barcode);
                const isAvailable = variant.availableForSale;

                // Check product-level availability
                const remainingProductQuantity = getRemainingProductQuantity(product);
                const isProductMaxedOut = remainingProductQuantity <= 0 && !isProductSelected;

                return (
                  <div
                    key={product.id}
                    onClick={() => (isAvailable && !isProductMaxedOut) && toggleSelect(product)}
                    className={`product-card ${isProductSelected ? 'selected' : ''} ${!isAvailable || isProductMaxedOut ? 'unavailable' : ''}`}
                  >
                    <div className={`product-image-container${isProductSelected ? ' selected' : ''}`}>
                      {/* Size bubble - only show if we can extract a meaningful size */}
                      {(() => {
                        const sizeText = extractSizeFromVariant(variant, product.title);
                        return sizeText ? (
                          <div className="size-bubble">
                            <span className="size-bubble-text">{sizeText}</span>
                          </div>
                        ) : null;
                      })()}

                      {isProductSelected && (
                        <div className="quantity-controls">
                          <button
                            className="inline-quantity-btn quantity-decrease"
                            onClick={(e) => currentQuantity === 1 ? handleRemoveItem(e, product) : handleQuantityDecrease(e, product)}
                          >
                            {currentQuantity === 1 ? (
                              // Trash icon for quantity 1
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3,6 5,6 21,6"></polyline>
                                <path d="m19,6v14a2,2 0 0,1-2,2H7a2,2 0 0,1-2-2V6m3,0V4a2,2 0 0,1,2-2h4a2,2 0 0,1,2,2v2"></path>
                                <line x1="10" y1="11" x2="10" y2="17"></line>
                                <line x1="14" y1="11" x2="14" y2="17"></line>
                              </svg>
                            ) : (
                              // Minus icon for quantity > 1
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                              </svg>
                            )}
                          </button>
                          <span
                            className="inline-quantity-display"
                            onClick={(e) => handleQuantityDisplayClick(e, product)}
                          >
                            {currentQuantity}
                          </span>
                          <button
                            className="inline-quantity-btn quantity-increase"
                            onClick={(e) => handleQuantityIncrease(e, product)}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="12" y1="5" x2="12" y2="19"></line>
                              <line x1="5" y1="12" x2="19" y2="12"></line>
                            </svg>
                          </button>
                        </div>
                      )}
                      {variant.image?.url ? (
                        <img
                          src={variant.image.url}
                          alt={product.title}
                          className="product-image"
                        />
                      ) : product.images?.edges?.[0]?.node?.url ? (
                        <img
                          src={product.images.edges[0].node.url}
                          alt={product.title}
                          className="product-image"
                        />
                      ) : (
                        <div style={{
                          width: '100%',
                          height: '100%',
                          backgroundColor: '#7F0716',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: '15px'
                        }}>
                          <svg
                            width="60"
                            height="60"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#666"
                            strokeWidth="1.5"
                          >
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <polyline points="21,15 16,10 5,21" />
                          </svg>
                        </div>
                      )}
                    </div>

                    <h3 className="product-title">
                      {product.title}
                      {product.bundleOnly && (
                        <span className="bundle-badge">Bundle Only</span>
                      )}
                    </h3>

                    <div className="product-price">
                      HK${parseFloat(variant.price.amount) % 1 === 0 ? parseInt(variant.price.amount) : variant.price.amount}
                    </div>

                    <div className={`product-status ${isAvailable && !isProductMaxedOut ? 'status-available' : 'status-unavailable'}`}>
                      {!isAvailable ? t('unavailable') : isProductMaxedOut ? t('productLimitReached') : t('available')}
                      {isAvailable && !isProductMaxedOut && remainingProductQuantity < 10 && (
                        <div className="remaining-quantity">
                          {remainingProductQuantity} {t('leftTotal')}
                        </div>
                      )}
                    </div>

                    {/* Bundle-only availability message */}
                    {product.bundleOnly && isAvailable && (
                      <div className="bundle-availability-note">
                        Available once an item is added into basket
                      </div>
                    )}
                  </div>
                );
              })}
              </div>

              {/* Next Button */}
              {selectedBarcodes.length > 0 && (
                <div className="action-buttons sticky-next-button">
                  <button
                    className="action-btn btn-next"
                    onClick={handleNextStep}
                  >
                    {t('next')} ({selectedItems.reduce((total, item) => total + item.quantity, 0)} {t('itemsSelected')})
                  </button>
                </div>
              )}

              <div className="action-buttons">
                {selectedBarcodes.length > 0 && (
                  <button className="action-btn btn-clear" onClick={clearList}>
                    {t('clearMyList')}
                  </button>
                )}
              </div>

              {/* Back Button */}
              {/* <div className="back-to-home-container">
                <a href="/" className="back-to-home-btn">
                  ← Back to Home
                </a>
              </div> */}

              {/* AOO Logo at bottom - faded and smaller */}
              <div className="bottom-aoo-logo">
                <img
                  src="/aoo-logo.png"
                  alt="AOO Logo"
                  style={{ width: '60px', height: 'auto', opacity: 0.3 }}
                />
              </div>
            </div>
          )}

          {/* Step 2: User Information Form */}
          {currentStep === 'userForm' && (
            <div className="step-container">
              <div className="user-form-container">
                {/* Rubify Branding at top of form */}
                <div style={{ textAlign: 'center', marginBottom: '30px', marginTop: '20px' }}>
                  <img
                    src="/rubify-branding.png"
                    alt="Complex Presents Rubify"
                    style={{
                      width: '90%',
                      maxWidth: '350px',
                      height: 'auto',
                      aspectRatio: '400/215',
                      objectFit: 'cover',
                      objectPosition: 'center',
                    }}
                  />
                </div>

                <h2 className="form-header">{t('leaveYourInformation')}</h2>
                <p className="form-subheader">{t('letUsKnowMore')}</p>

                <form onSubmit={handleUserFormSubmit}>
                  <div className="form-input-container">
                    <input
                      type="text"
                      placeholder={`${t('firstName')}*`}
                      value={userDetails.firstName}
                      onChange={handleFirstNameChange}
                      required
                      className="form-input"
                      name="firstName"
                    />
                    <label className="form-label">{t('firstName')}*</label>
                  </div>

                  <div className="form-input-container">
                    <input
                      type="text"
                      placeholder={`${t('lastName')}*`}
                      value={userDetails.lastName}
                      onChange={handleLastNameChange}
                      required
                      className="form-input"
                      name="lastName"
                    />
                    <label className="form-label">{t('lastName')}*</label>
                  </div>

                  <div className="form-input-container">
                    <input
                      type="email"
                      placeholder={`${t('email')}*`}
                      value={userDetails.email}
                      onChange={handleEmailChange}
                      required
                      className="form-input"
                      name="email"
                    />
                    <label className="form-label">{t('email')}*</label>
                  </div>

                  <div className="phone-container" style={{ display: 'flex', gap: '8px', alignItems: 'stretch', position: 'relative' }}>
                    <CountryCodeSelector
                      selectedCountry={selectedCountry}
                      onCountryChange={setSelectedCountry}
                      className="country-selector"
                      style={{ width: '120px', flexShrink: 0 }}
                    />
                    <div className="form-input-container" style={{ flex: 1, marginBottom: 0 }}>
                      <input
                        type="tel"
                        placeholder={selectedCountry.code === 'other' ? 'Enter with country code (e.g., +33123456789)' : 'Phone Number (e.g., 123456789)'}
                        value={userDetails.phone}
                        onChange={handlePhoneChange}
                        className="form-input"
                        name="phone"
                      />
                      <label className="form-label">{t('phone')}</label>
                    </div>
                  </div>

                  <div className="privacy-checkbox-container">
                    <input
                      type="checkbox"
                      id="privacy-agreement"
                      checked={userDetails.privacyAgreed}
                      onChange={(e) => setUserDetails({ ...userDetails, privacyAgreed: e.target.checked })}
                      className="privacy-checkbox"
                      required
                    />
                    <label htmlFor="privacy-agreement" className="privacy-text">
                      {t('termsAndConditions')} {t('importantInventoryNote')}
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={isCreatingCustomer || !userDetails.firstName || !userDetails.lastName || !userDetails.email || !userDetails.privacyAgreed}
                    className="form-button next-btn"
                  >
                    {isCreatingCustomer ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                        <div style={{
                          width: '20px',
                          height: '20px',
                          border: '2px solid transparent',
                          borderTop: '2px solid white',
                          borderRadius: '50%',
                          animation: 'spin 1s linear infinite'
                        }} />
                        Processing...
                      </div>
                    ) : (
                      t('next')
                    )}
                  </button>

                  <div
                    className="form-back-link"
                    onClick={handleBackToProducts}
                  >
                    {t('back')}
                  </div>

                  {/* AOO Logo at bottom */}
                  <div style={{ textAlign: 'center', marginTop: '40px' }}>
                    <img
                      src="/aoo-logo.png"
                      alt="AOO Logo"
                      style={{ width: '50px', height: 'auto', opacity: 0.3 }}
                    />
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Step 3: Summary is now a popup - see summary popup section below */}

          {/* Step 3: QR Code Display (was Step 4) */}
          {currentStep === 'qrCode' && (
            <div className="step-container">
              <div className="qr-code-container">
                {/* Rubify Branding */}
                <div style={{ textAlign: 'center', marginBottom: '30px', marginTop: '20px' }}>
                  <img
                    src="/rubify-branding.png"
                    alt="Complex Presents Rubify"
                    style={{
                      width: '90%',
                      maxWidth: '350px',
                      height: 'auto',
                      aspectRatio: '400/215',
                      objectFit: 'cover',
                      objectPosition: 'center',
                    }}
                  />
                </div>

                {/* Main Header */}
                <h1 style={{
                  color: '#ECEAEA',
                  fontFamily: 'Instrument Sans',
                  fontSize: '20px',
                  fontStyle: 'normal',
                  fontWeight: '600',
                  lineHeight: '28px',
                  letterSpacing: '0.5px',
                  marginBottom: '10px',
                  textAlign: 'left'
                }}>
                  {t('wishlistQRCode')}
                </h1>

                <p style={{
                  color: '#ECEAEA',
                  fontSize: '14px',
                  marginBottom: '20px',
                  textAlign: 'left',
                  fontFamily: 'Instrument Sans, sans-serif'
                }}>
                  {t('presentQRCode')}
                  <br />
                  <b>{t('presentQRCodeTipBold')}</b> {t('presentQRCodeTip')}
                </p>
                {/* Please Note */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  padding: '0px',
                  gap: '5px',
                  width: '100%',
                  flex: 'none',
                  order: 2,
                  alignSelf: 'stretch',
                  flexGrow: 0,
                  marginBottom: '40px'
                }}>
                  {/* Icon - Red circle with exclamation */}
                  <div style={{
                    width: '20px',
                    height: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '16px',
                    flexShrink: 0,
                    color: '#DD3131'
                  }}>
                    ⚠
                  </div>
                  {/* Text */}
                  <p style={{
                    color: '#DD3131',
                    fontSize: '18px',
                    textAlign: 'left',
                    lineHeight: '1.4',
                    fontFamily: 'Instrument Sans, sans-serif',
                    margin: '0',
                    flex: 1
                  }}>
                    {t('notReservation')}
                  </p>
                </div>
                {/* Dotted separator line */}
                <div style={{
                  borderTop: '2px dotted #666',
                  marginBottom: '30px'
                }}></div>

                {/* QR Code Container */}
                <div style={{
                  backgroundColor: '#E5E5E5',
                  borderRadius: '16px',
                  padding: '20px',
                  marginBottom: '30px',
                  textAlign: 'center'
                }}>
                  <h3 style={{
                    color: '#333',
                    fontSize: '16px',
                    fontWeight: '500',
                    marginBottom: '10px',
                    fontFamily: 'Instrument Sans, sans-serif'
                  }}>
                    {t('presentQRAtCheckout')}
                  </h3>

                  {/* QR Code */}
                  <div style={{ marginBottom: '20px' }}>
                    {barcodeDataUrl ? (
                      <img
                        src={barcodeDataUrl}
                        alt={`QR Code for Wishlist ${draftOrder?.name}`}
                        style={{
                          width: '100%',
                          maxWidth: '280px',
                          height: 'auto',
                          aspectRatio: '1',
                          margin: '0 auto',
                          display: 'block',
                          backgroundColor: '#E5E5E5',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                        }}
                        onClick={() => setIsQRExpanded(true)}
                        onMouseEnter={(e) => {
                          e.target.style.transform = 'scale(1.02)';
                          e.target.style.boxShadow = '0 4px 16px rgba(0,0,0,0.2)';
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.transform = 'scale(1)';
                          e.target.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
                        }}
                      />
                    ) : (
                      <div style={{
                        width: '100%',
                        maxWidth: '280px',
                        aspectRatio: '1',
                        backgroundColor: '#E5E5E5',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '60px',
                        margin: '0 auto',
                        borderRadius: '8px'
                      }}>
                        📱
                      </div>
                    )}
                  </div>

                  {/* Tap to expand hint */}
                  {barcodeDataUrl && (
                    <p style={{
                      color: '#666',
                      fontSize: '12px',
                      fontStyle: 'italic',
                      marginTop: '8px',
                      fontFamily: 'Instrument Sans, sans-serif'
                    }}>
                      {t('tapToEnlarge')}
                    </p>
                  )}

                  <p style={{
                    color: '#666',
                    fontSize: '14px',
                    fontFamily: 'Instrument Sans, sans-serif',
                    margin: 0
                  }}>
                    {selectedItems.reduce((total, item) => total + item.quantity, 0)} {t('of')} {maxItemsPerOrder} {t('itemsSelected')}
                  </p>
                </div>

                {/* Draft Order Number */}
                {draftOrder?.name && (
                  <div style={{
                    textAlign: 'center',
                    marginBottom: '30px',
                    marginTop: '20px'
                  }}>
                    <p style={{
                      color: '#ECEAEA',
                      fontSize: '16px',
                      fontWeight: '600',
                      fontFamily: 'Instrument Sans, sans-serif',
                      margin: 0
                    }}>
                      {draftOrder.name}
                    </p>
                  </div>
                )}

                {/* Embedded Summary Section */}
                <div style={{
                  marginBottom: '30px',
                  marginTop: '20px'
                }}>


                  {/* Summary Card */}
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    padding: '16px',
                    gap: '12px',
                    width: '100%',
                    background: '#111111',
                    border: '1px solid #575757',
                    boxShadow: '2px 4px 4px rgba(255, 255, 255, 0.1)',
                    borderRadius: '16px',
                    boxSizing: 'border-box'
                  }}>
                    {/* Summary title */}
                    <div style={{
                      fontFamily: 'Instrument Sans',
                      fontWeight: 600,
                      fontSize: '16px',
                      lineHeight: '20px',
                      color: '#FFFFFF',
                      width: '100%'
                    }}>
                      {t('summary')}
                    </div>

                    {/* Items header */}
                    <div style={{
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'flex-start',
                      padding: '0px',
                      gap: '10px',
                      width: '100%'
                    }}>
                      <div style={{
                        fontFamily: 'Instrument Sans',
                        fontWeight: 500,
                        fontSize: '12px',
                        lineHeight: '20px',
                        color: '#BBB3B6',
                        flex: 1
                      }}>
                        {t('items')}
                      </div>
                      <div style={{
                        fontFamily: 'Instrument Sans',
                        fontWeight: 500,
                        fontSize: '12px',
                        lineHeight: '20px',
                        textAlign: 'right',
                        color: '#BBB3B6',
                        flex: 1
                      }}>
                        {t('price')}
                      </div>
                    </div>

                    {/* Items list */}
                    {selectedItems.map((item, index) => {
                      const price = parseFloat(item.price);
                      const totalItemPrice = price * item.quantity;

                      return (
                        <div key={item.barcode} style={{
                          width: '100%'
                        }}>
                          {/* Item row */}
                          <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            width: '100%',
                            minHeight: '30px',
                            padding: '0px',
                            gap: '10px'
                          }}>
                            {/* Left side: Quantity and Product name */}
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              width: '100%',
                              flex: 1
                            }}>
                              <span style={{
                                fontFamily: 'Avenir',
                                fontWeight: 500,
                                fontSize: '14px',
                                lineHeight: '20px',
                                color: '#FFFFFF'
                              }}>
                                {item.quantity}x
                              </span>
                              <div style={{
                                fontFamily: 'Instrument Sans',
                                fontWeight: 600,
                                fontSize: '14px',
                                lineHeight: '20px',
                                color: '#FFFFFF'
                              }}>
                                {item.productTitle}
                              </div>
                            </div>

                            {/* Right side: Price */}
                            <div style={{
                              fontFamily: 'Instrument Sans',
                              fontWeight: 500,
                              fontSize: '14px',
                              lineHeight: '20px',
                              color: '#FFFFFF',
                              textAlign: 'right'
                            }}>
                              HK${totalItemPrice % 1 === 0 ? parseInt(totalItemPrice) : totalItemPrice.toFixed(2)}
                            </div>
                          </div>

                          {/* Separator line (except for last item) */}
                          {index < selectedItems.length - 1 && (
                            <div style={{
                              width: '100%',
                              height: '0px',
                              border: '0.5px solid #575757',
                              margin: '6px 0',
                              opacity: 0.6
                            }} />
                          )}
                        </div>
                      );
                    })}

                    {/* Final separator before total */}
                    <div style={{
                      width: '100%',
                      height: '0px',
                      border: '0.5px solid #575757',
                      margin: '6px 0',
                      opacity: 0.6
                    }} />

                    {/* Total row */}
                    <div style={{
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'center',
                      padding: '5px 0px',
                      gap: '10px',
                      width: '100%',
                      minHeight: '30px'
                    }}>
                      <div style={{
                        fontFamily: 'Instrument Sans',
                        fontWeight: 600,
                        fontSize: '20px',
                        lineHeight: '20px',
                        color: '#FFFFFF',
                        flex: 1
                      }}>
                        {t('total')}
                      </div>
                      <div style={{
                        fontFamily: 'Instrument Sans',
                        fontWeight: 600,
                        fontSize: '16px',
                        lineHeight: '20px',
                        textAlign: 'right',
                        color: '#FFFFFF',
                        flex: 1
                      }}>
                        HK${selectedItems.reduce((total, item) => {
                          const price = parseFloat(item.price);
                          return total + (price * item.quantity);
                        }, 0).toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  className="back-link"
                  onClick={handleStartOver}
                  style={{ marginBottom: '20px' }}
                >
                  {t('backToStart')}
                </div>

                {/* AOO Logo at bottom */}
                <div style={{ textAlign: 'center', marginTop: '40px' }}>
                  <img
                    src="/aoo-logo.png"
                    alt="AOO Logo"
                    style={{ width: '60px', height: 'auto', opacity: 0.3 }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Product Selection Popup */}
      {showProductPopup && selectedProduct && (
        <div className="product-popup-overlay" onClick={handleClosePopup}>
          <div className="product-popup" onClick={(e) => e.stopPropagation()}>
            <div className="popup-header">
              <h2 className="popup-title">
                {selectedProduct.title}
                {selectedProduct.bundleOnly && (
                  <span className="popup-bundle-badge">Bundle Only</span>
                )}
              </h2>
              <button className="popup-close" onClick={handleClosePopup}>
                ×
              </button>
            </div>

            <div className="popup-content">
              <div className="popup-content-inner">
                {/* Product Image Carousel */}
                <div className="image-carousel-container">
                  <div className="popup-product-image">
                    {(() => {
                      const availableImages = getAvailableImages();
                      const currentImage = availableImages[currentImageIndex];

                      if (currentImage) {
                        return (
                          <img
                            src={currentImage.url}
                            alt={currentImage.altText}
                          />
                        );
                      } else {
                        return (
                          <div style={{
                            fontSize: '60px',
                            color: '#666'
                          }}>
                            📱
                          </div>
                        );
                      }
                    })()}

                    {/* Navigation buttons - only show if there are multiple images */}
                    {getAvailableImages().length > 1 && (
                      <div className="carousel-nav-container">
                        <button
                          className="carousel-nav-btn prev"
                          onClick={handlePreviousImage}
                          type="button"
                        >
                          <svg
                            className="carousel-arrow left"
                            viewBox="0 0 20 20"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              d="M10 2L3 10L10 18"
                              stroke="#FFFFFF"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                        <button
                          className="carousel-nav-btn next"
                          onClick={handleNextImage}
                          type="button"
                        >
                          <svg
                            className="carousel-arrow right"
                            viewBox="0 0 20 20"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              d="M10 2L3 10L10 18"
                              stroke="#FFFFFF"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                      </div>
                    )}

                    {/* Image dots indicator - only show if there are multiple images */}
                    {getAvailableImages().length > 1 && (
                      <div className="image-dots-container">
                        {getAvailableImages().map((_, index) => (
                          <div
                            key={index}
                            className={`image-dot ${index === currentImageIndex ? 'active' : ''}`}
                            onClick={() => setCurrentImageIndex(index)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Quantity Selection */}
                <div className="popup-section">
                  <div className="quantity-section">
                    <div className="quantity-label">{t('quantity')}*</div>
                    <div className="quantity-container">
                      <button
                        className="popup-quantity-btn"
                        onClick={() => setSelectedQuantity(Math.max(1, selectedQuantity - 1))}
                        disabled={selectedQuantity <= 1}
                      >
                        −
                      </button>
                      <span className="quantity-display">{selectedQuantity}</span>
                      <button
                        className="popup-quantity-btn"
                        onClick={() => {
                          const maxLimit = selectedProduct.maxPerOrder || 5; // Default to 5 if no limit set
                          console.log(`➕ Plus button clicked. Current quantity: ${selectedQuantity}, maxPerOrder: ${selectedProduct.maxPerOrder}, calculated maxLimit: ${maxLimit}`);

                          // Check overall cart limit
                          const currentTotalItems = selectedItems.reduce((total, item) => total + item.quantity, 0);
                          const existingItem = selectedItems.find(item => item.barcode === selectedVariant.barcode);
                          const newTotalItems = existingItem
                            ? currentTotalItems - existingItem.quantity + selectedQuantity + 1
                            : currentTotalItems + selectedQuantity + 1;

                          if (newTotalItems > maxItemsPerOrder) {
                            showNotification(
                              `Maximum ${maxItemsPerOrder} items allowed per order.`,
                              'error'
                            );
                            return;
                          }

                          const newQuantity = Math.min(maxLimit, selectedQuantity + 1);
                          console.log(`➕ Setting new quantity to: ${newQuantity}`);
                          setSelectedQuantity(newQuantity);
                        }}
                        disabled={selectedQuantity >= (selectedProduct.maxPerOrder || 5)}
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Show quantity note only if maxPerOrder is set */}
                  {selectedProduct.maxPerOrder && (
                    <div className="quantity-note">* {t('purchaseLimit')} {selectedProduct.maxPerOrder} {t('piecesPerItem')}</div>
                  )}

                  {/* Show bundle note for bundle-only items */}
                  {selectedProduct.bundleOnly && (
                    <div className="bundle-note">
                      {(() => {
                        const hasNonBundleItems = selectedItems.some(item => {
                          const itemProduct = allProducts.find(product =>
                            product.variants.edges.some(edge => edge.node.barcode === item.barcode)
                          );
                          return !itemProduct?.bundleOnly;
                        });

                        if (!hasNonBundleItems) {
                          return `* ${t('addRegularItemFirst')}`;
                        } else {
                          return `* ${t('bundleRequiresRegular')}`;
                        }
                      })()}
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="popup-actions">
                  <button className="popup-btn popup-btn-secondary" onClick={handleClosePopup}>
                    {isEditMode ? t('cancel') : t('close')}
                  </button>
                  <button
                    className="popup-btn popup-btn-primary"
                    onClick={isEditMode ? handleEditExistingItem : handleAddToWishlist}
                    disabled={(() => {
                      console.log('🔍 Button disabled check:', {
                        isEditMode,
                        selectedVariant: !!selectedVariant,
                        selectedQuantity,
                        bundleOnly: selectedProduct.bundleOnly
                      });

                      // Basic validation
                      if (!selectedVariant || selectedQuantity < 1) {
                        console.log('🚫 Button disabled: Basic validation failed');
                        return true;
                      }

                      // Bundle validation: only for new items (not in edit mode)
                      if (!isEditMode && selectedProduct.bundleOnly) {
                        const hasNonBundleItems = selectedItems.some(item => {
                          const itemProduct = allProducts.find(product =>
                            product.variants.edges.some(edge => edge.node.barcode === item.barcode)
                          );
                          return !itemProduct?.bundleOnly;
                        });

                        if (!hasNonBundleItems) {
                          console.log('🚫 Confirm button disabled: Bundle item requires non-bundle items in cart');
                          return true;
                        }
                      }

                      console.log('✅ Button enabled');
                      return false;
                    })()}
                  >
                    {isEditMode ? t('update') : t('confirm')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Summary Popup - New Flow */}
      {showSummaryPopup && (
        <div className="product-popup-overlay" onClick={handleSummaryClose}>
          <div className="summary-popup-container" onClick={(e) => e.stopPropagation()}>
            {/* Close button */}
            <div style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              display: 'none' // Hidden as per design
            }}>
              <button
                onClick={handleSummaryClose}
                style={{
                  width: '44px',
                  height: '44px',
                  background: '#1B1B1B',
                  border: '1px solid #575757',
                  borderRadius: '16px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <span style={{ color: '#FFFFFF', fontSize: '20px' }}>×</span>
              </button>
            </div>

            {/* Main content */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '10px 5px',
              paddingBottom: '20px',
              gap: '20px',
              width: '667px',
              maxWidth: '90vw',
              background: '#000000',
              border: '1px solid #4D4D4D',
              boxShadow: '0px 0px 10px rgba(0, 0, 0, 0.07)',
              borderRadius: '16px',
              filter: 'drop-shadow(2px 4px 4px rgba(255, 255, 255, 0.1))',

            }}>
              {/* Header section */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                padding: '0px',
                gap: '24px',
                width: '627px',
                maxWidth: 'calc(100% - 40px)'
              }}>
                {/* Title and subtitle */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  padding: '0px',
                  gap: '5px',
                  width: '100%'
                }}>
                  <h2 style={{
                    margin: 0,
                    fontFamily: 'Instrument Sans',
                    fontWeight: 600,
                    fontSize: '25px',
                    lineHeight: '40px',
                    letterSpacing: '0.02em',
                    color: '#ECEAEA'
                  }}>
                    {t('wishlistSummary')}
                  </h2>
                  <p style={{
                    margin: 0,
                    fontFamily: 'Instrument Sans',
                    fontWeight: 400,
                    fontSize: '16px',
                    lineHeight: '24px',
                    color: '#FFFFFF',
                    width: '100%'
                  }}>
                    {t('pleaseCheck')}
                  </p>
                </div>

                {/* Please Note section */}
                <div style={{
                  fontFamily: 'Instrument Sans',
                  fontWeight: 600,
                  fontSize: '16px',
                  lineHeight: '24px',
                  color: '#FFFFFF',
                  width: '100%'
                }}>
                  <strong>{t('pleaseNote')}</strong> {t('notGuaranteed')}
                </div>

                {/* Summary card */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  padding: '12px',
                  gap: '10px',
                  width: '100%',
                  background: '#111111',
                  border: '1px solid #575757',
                  boxShadow: '2px 4px 4px rgba(255, 255, 255, 0.1)',
                  borderRadius: '16px'
                }}>
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    padding: '0px',
                    gap: '6px',
                    width: '100%'
                  }}>
                    {/* Summary title */}
                    <div style={{
                      fontFamily: 'Instrument Sans',
                      fontWeight: 600,
                      fontSize: '16px',
                      lineHeight: '20px',
                      color: '#FFFFFF',
                      width: '100%'
                    }}>
                      {t('summary')}
                    </div>

                    {/* Items header */}
                    <div style={{
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'flex-start',
                      padding: '0px',
                      gap: '10px',
                      width: '100%'
                    }}>
                      <div style={{
                        fontFamily: 'Instrument Sans',
                        fontWeight: 500,
                        fontSize: '12px',
                        lineHeight: '20px',
                        color: '#BBB3B6',
                        flex: 1
                      }}>
                        {t('items')}
                      </div>
                      <div style={{
                        fontFamily: 'Instrument Sans',
                        fontWeight: 500,
                        fontSize: '12px',
                        lineHeight: '20px',
                        textAlign: 'right',
                        color: '#BBB3B6',
                        flex: 1
                      }}>
                        {t('price')}
                      </div>
                    </div>

                    {/* Items list */}
                    {selectedItems.map((item, index) => {
                      const price = parseFloat(item.price);
                      const totalItemPrice = price * item.quantity;

                      return (
                        <div key={item.barcode} style={{
                          width: '100%'
                        }}>
                          {/* Item row - restructured with two divs for proper alignment */}
                          <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            width: '100%',
                            height: '30px',
                            padding: '0px',
                            gap: '10px'
                          }}>
                            {/* Left side: Quantity and Product name */}
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              width: '100%',
                              flex: 1
                            }}>
                              <span style={{
                                fontFamily: 'Avenir',
                                fontWeight: 500,
                                fontSize: '14px',
                                lineHeight: '20px',
                                color: '#FFFFFF'
                              }}>
                                {item.quantity}x
                              </span>
                              <div style={{
                                fontFamily: 'Instrument Sans',
                                fontWeight: 600,
                                fontSize: '14px',
                                lineHeight: '30px',
                                color: '#FFFFFF'
                              }}>
                                {item.productTitle}

                              </div>
                            </div>

                            {/* Right side: Price */}
                            <div style={{
                              fontFamily: 'Instrument Sans',
                              fontWeight: 500,
                              fontSize: '14px',
                              lineHeight: '20px',
                              color: '#FFFFFF',
                              textAlign: 'right'

                            }}>
                              HK${totalItemPrice % 1 === 0 ? parseInt(totalItemPrice) : totalItemPrice.toFixed(2)}
                            </div>
                          </div>

                          {/* Separator line (except for last item) */}
                          {index < selectedItems.length - 1 && (
                            <div style={{
                              width: '100%',
                              height: '0px',
                              border: '0.5px solid #575757',
                              margin: '6px 0',
                              opacity: 0.6
                            }} />
                          )}
                        </div>
                      );
                    })}

                    {/* Final separator before total */}
                    <div style={{
                      width: '100%',
                      height: '0px',
                      border: '0.5px solid #575757',
                      margin: '6px 0',
                      opacity: 0.6
                    }} />

                    {/* Total row */}
                    <div style={{
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'center',
                      padding: '5px 0px',
                      gap: '10px',
                      width: '100%',
                      height: '30px'
                    }}>
                      <div style={{
                        fontFamily: 'Instrument Sans',
                        fontWeight: 600,
                        fontSize: '20px',
                        lineHeight: '16px',
                        color: '#FFFFFF',
                        flex: 1
                      }}>
                        {t('total')}
                      </div>
                      <div style={{
                        fontFamily: 'Instrument Sans',
                        fontWeight: 600,
                        fontSize: '16px',
                        lineHeight: '20px',
                        textAlign: 'right',
                        color: '#FFFFFF',
                        flex: 1
                      }}>
                        HK${selectedItems.reduce((total, item) => {
                          const price = parseFloat(item.price);
                          return total + (price * item.quantity);
                        }, 0).toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Buttons */}
              <div style={{
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '0px',
                gap: '10px',
                width: '627px',
                maxWidth: 'calc(100% - 40px)',
                height: '48px'
              }}>
                {/* Close button */}
                <button
                  onClick={handleSummaryClose}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: '0px',
                    width: '308.5px',
                    height: '48px',
                    background: 'transparent',
                    border: '1px solid #ECEAEA',
                    borderRadius: '99999px',
                    cursor: 'pointer',
                    flex: 1
                  }}
                >
                  <div style={{
                    display: 'flex',
                    flexDirection: 'row',
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: '0px 24px',
                    gap: '8px',
                    width: '100%',
                    height: '48px'
                  }}>
                    <span style={{
                      fontFamily: 'Instrument Sans',
                      fontWeight: 600,
                      fontSize: '18px',
                      lineHeight: '24px',
                      color: '#ECEAEA'
                    }}>
                      {t('close')}
                    </span>
                  </div>
                </button>

                {/* Confirm button */}
                <button
                  onClick={handleSummaryConfirm}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: '0px',
                    width: '308.5px',
                    height: '48px',
                    background: '#FFFFFF',
                    border: '1px solid #E9E9E9',
                    borderRadius: '99999px',
                    cursor: 'pointer',
                    flex: 1
                  }}
                >
                  <div style={{
                    display: 'flex',
                    flexDirection: 'row',
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: '0px 24px',
                    gap: '8px',
                    width: '100%',
                    height: '48px'
                  }}>
                    <span style={{
                      fontFamily: 'Instrument Sans',
                      fontWeight: 600,
                      fontSize: '18px',
                      lineHeight: '24px',
                      color: '#111111'
                    }}>
                      {t('confirm')}
                    </span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action Results */}
      {actionData && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          maxWidth: '400px',
          padding: '15px',
          borderRadius: '8px',
          zIndex: 1000,
          backgroundColor: actionData.success ? '#d1fae5' : '#fee2e2',
          border: actionData.success ? '1px solid #a7f3d0' : '1px solid #fecaca',
          color: actionData.success ? '#065f46' : '#991b1b'
        }}>
          <h3 style={{ fontWeight: '600', marginBottom: '5px' }}>
            {actionData.success ? '✅ Success!' : '❌ Error'}
          </h3>
          <p style={{ fontSize: '14px' }}>
            {actionData.message || actionData.error}
          </p>
        </div>
      )}

      {/* Expanded QR Code Modal */}
      {isQRExpanded && barcodeDataUrl && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: window.innerWidth < 768 ? '10px' : '20px',
            animation: 'fadeIn 0.3s ease-out'
          }}
          onClick={() => setIsQRExpanded(false)}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: window.innerWidth < 768 ? '12px' : '16px',
              padding: window.innerWidth < 768 ? '10px' : '15px',
              width: window.innerWidth < 768 ? 'calc(100vw - 20px)' : 'auto',
              height: window.innerWidth < 768 ? 'calc(100vh - 20px)' : 'auto',
              maxWidth: window.innerWidth < 768 ? 'none' : '90vw',
              maxHeight: window.innerWidth < 768 ? 'none' : '90vh',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              animation: 'slideDown 0.3s ease-out'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              style={{
                position: 'absolute',
                top: '15px',
                right: '15px',
                background: 'none',
                border: 'none',
                fontSize: '32px',
                cursor: 'pointer',
                color: '#666',
                padding: '8px',
                borderRadius: '50%',
                width: '50px',
                height: '50px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: '300',
                lineHeight: '1'
              }}
              onClick={() => setIsQRExpanded(false)}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#f0f0f0';
                e.target.style.color = '#333';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = 'transparent';
                e.target.style.color = '#666';
              }}
            >
              ×
            </button>

            {/* Title */}
            <h2 style={{
              color: '#333',
              fontSize: '18px',
              fontWeight: '600',
              marginBottom: '10px',
              marginTop: '10px',
              textAlign: 'center',
              fontFamily: 'Instrument Sans, sans-serif'
            }}>
              Wishlist QR Code
            </h2>



            {/* Instructions - Moved above QR code */}
            <p style={{
              color: '#666',
              fontSize: '14px',
              textAlign: 'center',
              marginTop: '0px',
              marginBottom: '20px',
              fontFamily: 'Instrument Sans, sans-serif',
              maxWidth: '300px'
            }}>
              {t('presentQRCode')}
            </p>

            {/* Expanded QR Code */}
            <img
              src={barcodeDataUrl}
              alt={`Expanded QR Code for Wishlist ${draftOrder?.name}`}
              style={{
                width: '100%',
                maxWidth: window.innerWidth < 768 ?
                  (window.innerHeight > window.innerWidth ? 'min(90vw, 70vh)' : 'min(70vw, 60vh)') :
                  'min(85vw, 85vh, 500px)',
                height: 'auto',
                aspectRatio: '1',
                borderRadius: '8px',
                backgroundColor: '#fff',
                boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
              }}
            />

            {/* Close instruction - Moved below QR code */}
            <p style={{
              color: '#999',
              fontSize: '12px',
              textAlign: 'center',
              marginTop: '15px',
              marginBottom: '5px',
              fontFamily: 'Instrument Sans, sans-serif',
              maxWidth: '300px',
              fontStyle: 'italic'
            }}>
              Tap anywhere outside to close.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
