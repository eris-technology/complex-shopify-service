const { DataTypes } = require('sequelize');
const { sequelize } = require('complex-common-utils');

/**
 * Wishlist Model
 * 
 * Represents a shopping wishlist created by a user via kiosk or mobile app.
 * Wishlists are linked to Salesforce user IDs and can be processed at POS.
 */
const Wishlist = sequelize.define('Wishlist', {
  wishlist_id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false,
    comment: 'Primary identifier for the wishlist'
  },

  user_id: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'Salesforce user ID (owner of the wishlist)',
    validate: {
      notEmpty: true
    }
  },

  collection_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Shopify collection ID this wishlist is associated with'
  },

  status: {
    type: DataTypes.ENUM('ACTIVE', 'PROCESSING', 'COMPLETED', 'CANCELLED', 'EXPIRED'),
    allowNull: false,
    defaultValue: 'ACTIVE',
    comment: 'Current wishlist status'
  },

  source: {
    type: DataTypes.ENUM('KIOSK', 'MOBILE_APP'),
    allowNull: false,
    comment: 'Origin of the wishlist creation'
  },

  shopify_draft_order_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Legacy Shopify draft order ID (if created)'
  },

  qr_code_token: {
    type: DataTypes.STRING(255),
    allowNull: true,
    unique: true,
    comment: 'One-time token for QR code (prevents reuse)'
  },

  qr_code_used_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Timestamp when QR code was scanned and used'
  },

  processed_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Timestamp when wishlist was completed at POS'
  },

  processed_by: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Staff member or system that processed the wishlist'
  },

  expires_at: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'Expiration timestamp for the wishlist'
  },

  metadata: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Additional metadata (customer info, preferences, etc.)'
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
  tableName: 'wishlists',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['user_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['qr_code_token'],
      unique: true
    },
    {
      fields: ['expires_at']
    },
    {
      fields: ['user_id', 'collection_id']
    }
  ]
});

module.exports = Wishlist;
