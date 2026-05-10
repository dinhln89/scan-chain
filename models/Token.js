const { DataTypes } = require("sequelize");
const sequelize = require("../db");

const Token = sequelize.define(
  "Token",
  {
    address: {
      type: DataTypes.STRING(42),
      primaryKey: true,
    },
    symbol: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
  },
  {
    tableName: "tokens",
    timestamps: false,
  },
);

module.exports = Token;
