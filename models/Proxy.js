const { DataTypes } = require("sequelize");
const sequelize = require("../db");

const Proxy = sequelize.define(
  "Proxy",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    proxy: { type: DataTypes.STRING(42), allowNull: false },
    implementation: { type: DataTypes.STRING(42), allowNull: false },
    chain: { type: DataTypes.STRING(10), allowNull: false },
    decompileInitDone: { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  {
    tableName: "proxies",
    timestamps: true,
    indexes: [{ unique: true, fields: ["proxy", "chain"] }],
  },
);

module.exports = Proxy;
