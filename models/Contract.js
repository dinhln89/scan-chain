const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const Contract = sequelize.define('Contract', {
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
  type: {
    type: DataTypes.ENUM('bsc', 'ethereum'),
    allowNull: false,
    defaultValue: 'bsc',
  },
}, {
  tableName: 'contracts',
  timestamps: false,
  indexes: [
    { unique: true, fields: ['address'] },
  ],
});

module.exports = Contract;
