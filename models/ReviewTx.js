const { DataTypes } = require("sequelize");
const sequelize = require("../db");

const ReviewTx = sequelize.define(
  "ReviewTx",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    txHash: {
      type: DataTypes.STRING(66),
      allowNull: false,
    },
    address: {
      type: DataTypes.STRING(42),
      allowNull: false,
    },
    isCallInput: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    isTransferSender: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    isGetReserves: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    isBalanceOf: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    tableName: "review_txs",
    timestamps: false,
    indexes: [{ unique: true, fields: ["txHash"] }, { fields: ["address"] }],
  },
);

module.exports = ReviewTx;
