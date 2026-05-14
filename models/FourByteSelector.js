const { DataTypes } = require("sequelize");
const sequelize = require("../db");

const FourByteSelector = sequelize.define(
  "FourByteSelector",
  {
    selector: {
      type: DataTypes.STRING(10),
      primaryKey: true,
    },
    signature: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
  },
  {
    tableName: "four_byte_selectors",
    timestamps: false,
  },
);

module.exports = FourByteSelector;
