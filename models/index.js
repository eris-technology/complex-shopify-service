/**
 * Models Index - Entity Bindings
 * 
 * Defines all Sequelize models and their associations.
 */

const { sequelize } = require('complex-common-utils');
const Wishlist = require('./wishlist.model');
const WishlistItem = require('./wishlistItem.model');
const Idempotency = require('./idempotency.model');

/**
 * Define associations between models
 */

// Wishlist <-> WishlistItem (one-to-many)
Wishlist.hasMany(WishlistItem, {
  foreignKey: 'wishlist_id',
  as: 'items',
  onDelete: 'CASCADE'
});
WishlistItem.belongsTo(Wishlist, {
  foreignKey: 'wishlist_id',
  as: 'wishlist'
});

// Wishlist <-> Idempotency (one-to-many)
Wishlist.hasMany(Idempotency, {
  foreignKey: 'wishlist_id',
  as: 'idempotencyRecords'
});
Idempotency.belongsTo(Wishlist, {
  foreignKey: 'wishlist_id',
  as: 'wishlist'
});

module.exports = {
  // Sequelize instance for tests
  sequelize,
  
  // Models
  Wishlist,
  WishlistItem,
  Idempotency
};
