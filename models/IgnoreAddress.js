const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const IgnoreAddress = sequelize.define('IgnoreAddress', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  address: {
    type: DataTypes.STRING(42),
    allowNull: false,
    unique: true,
  },
  note: {
    type: DataTypes.STRING,
    allowNull: true,
  },
}, {
  tableName: 'ignore_addresses',
  timestamps: false,
  indexes: [
    { unique: true, fields: ['address'] },
  ],
});

module.exports = IgnoreAddress;
