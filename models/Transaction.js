const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const Transaction = sequelize.define('Transaction', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  hash: {
    type: DataTypes.STRING(66),
    allowNull: false,
    unique: true,
  },
  blockNumber: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  from: {
    type: DataTypes.STRING(42),
    allowNull: false,
  },
  to: {
    type: DataTypes.STRING(42),
    allowNull: true,
  },
  value: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  input: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  type: {
    type: DataTypes.ENUM('bsc', 'ethereum'),
    allowNull: false,
    defaultValue: 'bsc',
  },
  processed: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
}, {
  tableName: 'transactions',
  timestamps: false,
  indexes: [
    { unique: true, fields: ['hash'] },
    { fields: ['blockNumber'] },
    { fields: ['from'] },
    { fields: ['to'] },
    { fields: ['processed'] },
  ],
});

module.exports = Transaction;
