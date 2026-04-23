const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const Setting = sequelize.define('Setting', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  key: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  value: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  tableName: 'settings',
  timestamps: false,
});

Setting.get = async (key) => {
  const row = await Setting.findOne({ where: { key } });
  return row ? row.value : null;
};

Setting.set = async (key, value) => {
  await Setting.upsert({ key, value: String(value) });
};

Setting.remove = async (key) => {
  await Setting.destroy({ where: { key } });
};

module.exports = Setting;
