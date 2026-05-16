const { DataTypes } = require("sequelize");
const sequelize = require("../db");

const Contract = sequelize.define(
  "Contract",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    address: {
      type: DataTypes.STRING(42),
      allowNull: false,
    },
    txCount: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0,
    },
    isBlock: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    isPair: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: null,
    },
    url: {
      type: DataTypes.STRING(1000),
      allowNull: false,
      defaultValue: "",
    },
  },
  {
    tableName: "contracts",
    timestamps: false,
    indexes: [
      { unique: true, fields: ["address"] },
      { fields: ["isBlock"], name: "contracts_is_block" },
    ],
  },
);

module.exports = Contract;
