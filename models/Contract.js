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
      unique: true,
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
    url: {
      type: DataTypes.STRING(1000),
      allowNull: false,
      defaultValue: "",
    },
  },
  {
    tableName: "contracts",
    timestamps: false,
    indexes: [{ unique: true, fields: ["address"] }],
  },
);

module.exports = Contract;
