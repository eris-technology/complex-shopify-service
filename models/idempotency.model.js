const { DataTypes } = require('sequelize');
const { sequelize } = require('complex-common-utils');

/**
 * Idempotency Model
 * 
 * Prevents duplicate processing of wishlists and operations.
 * Tracks idempotency keys to ensure operations are only executed once.
 */
const Idempotency = sequelize.define('Idempotency', {
  idempotency_id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false,
    comment: 'Primary identifier'
  },

  idempotency_key: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
    comment: 'Unique key to prevent duplicate operations'
  },

  wishlist_id: {
    type: DataTypes.UUID,
    allowNull: true,
    comment: 'Related wishlist (if applicable)',
    references: {
      model: 'wishlists',
      key: 'wishlist_id'
    },
    onDelete: 'CASCADE'
  },

  operation_type: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Type of operation (CREATE_WISHLIST, PROCESS_WISHLIST, etc.)'
  },

  request_payload: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Original request payload for debugging'
  },

  response_data: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Response data from the operation'
  },

  status: {
    type: DataTypes.ENUM('PROCESSING', 'COMPLETED', 'FAILED'),
    allowNull: false,
    defaultValue: 'PROCESSING',
    comment: 'Status of the idempotent operation'
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
  tableName: 'idempotency',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['idempotency_key'],
      unique: true
    },
    {
      fields: ['wishlist_id']
    },
    {
      fields: ['created_at']
    }
  ]
});

module.exports = Idempotency;
