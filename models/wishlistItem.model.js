const { DataTypes } = require('sequelize');
const { sequelize } = require('complex-common-utils');

/**
 * WishlistItem Model
 * 
 * Represents individual products/variants in a wishlist.
 * Stores complete product data to avoid dependency on Shopify during processing.
 */
const WishlistItem = sequelize.define('WishlistItem', {
  item_id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false,
    comment: 'Primary identifier for the wishlist item'
  },

  wishlist_id: {
    type: DataTypes.UUID,
    allowNull: false,
    comment: 'Foreign key to Wishlist',
    references: {
      model: 'wishlists',
      key: 'wishlist_id'
    },
    onDelete: 'CASCADE'
  },

  shopify_variant_id: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Shopify variant ID (can be numeric or GID format)'
  },

  shopify_product_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Shopify product ID for reference'
  },

  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    validate: {
      min: 1
    },
    comment: 'Quantity of this variant'
  },

  product_title: {
    type: DataTypes.STRING(500),
    allowNull: false,
    comment: 'Product title at time of wishlist creation'
  },

  variant_title: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Variant title (size, color, etc.)'
  },

  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    comment: 'Price at time of wishlist creation'
  },

  currency: {
    type: DataTypes.STRING(3),
    allowNull: true,
    defaultValue: 'HKD',
    comment: 'Currency code (ISO 4217)'
  },

  barcode: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Product barcode/SKU for POS scanning'
  },

  image_url: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Product image URL'
  },

  product_data: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Complete product/variant data snapshot from Shopify'
  },

  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false
  },

  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false
  }
}, {
  tableName: 'wishlist_items',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['wishlist_id']
    },
    {
      fields: ['shopify_variant_id']
    }
  ]
});

module.exports = WishlistItem;
