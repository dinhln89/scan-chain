const { DataTypes } = require("sequelize");
const sequelize = require("../db");

const ContractDecompile = sequelize.define(
  "ContractDecompile",
  {
    address: {
      type: DataTypes.STRING(42),
      primaryKey: true,
    },
    // Nếu là proxy, trỏ tới implementation đã decompile
    proxyOf: {
      type: DataTypes.STRING(42),
      allowNull: true,
    },
    bytecodeSize: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    // Nguồn: "sourcify" | "gigahorse"
    source: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    externalCalls: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    events: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    // Mảng { group, sig } đã được phân loại
    functions: {
      type: DataTypes.JSON,
      allowNull: false,
    },
  },
  {
    tableName: "contract_decompiles",
    timestamps: true,
  },
);

module.exports = ContractDecompile;
