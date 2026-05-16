const { DataTypes } = require("sequelize");
const sequelize = require("../db");

const Proxy = sequelize.define(
  "Proxy",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    proxy: { type: DataTypes.STRING(42), allowNull: false },
    implementation: { type: DataTypes.STRING(42), allowNull: false },
    chain: { type: DataTypes.STRING(10), allowNull: false },
  },
  {
    tableName: "proxies",
    timestamps: true,
    updatedAt: false,
    indexes: [{ unique: true, fields: ["proxy", "implementation", "chain"] }],
  },
);

module.exports = Proxy;
