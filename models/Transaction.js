const { DataTypes } = require("sequelize");
const sequelize = require("../db");

const Transaction = sequelize.define(
  "Transaction",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    hash: {
      type: DataTypes.STRING(66),
      allowNull: false,
    },
    blockNumber: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    from: {
      type: DataTypes.STRING(42),
      allowNull: false,
    },
    to: {
      type: DataTypes.STRING(42),
      allowNull: true,
    },
    value: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    input: {
      type: DataTypes.TEXT("medium"),
      allowNull: true,
    },
    selector: {
      type: DataTypes.STRING(10),
      allowNull: true,
    },
    type: {
      type: DataTypes.ENUM("bsc", "ethereum"),
      allowNull: false,
      defaultValue: "bsc",
    },
    processed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    tableName: "transactions",
    timestamps: false,
    indexes: [
      { unique: true, fields: ["hash"] },
      { fields: ["from"] },
      { fields: ["to"] },
      { fields: ["processed"] },
      { fields: ["selector", "to"] },
    ],
  },
);

module.exports = Transaction;
