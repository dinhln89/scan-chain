const { DataTypes } = require("sequelize");
const sequelize = require("../db");

const History = sequelize.define(
  "History",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    chain: { type: DataTypes.STRING(10), allowNull: false },
    scanned: { type: DataTypes.BIGINT, allowNull: false },
    chainHead: { type: DataTypes.BIGINT, allowNull: false },
  },
  {
    tableName: "histories",
    timestamps: false,
    indexes: [{ unique: true, fields: ["date", "chain"] }],
  },
);

module.exports = History;
