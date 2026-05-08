const winston = require("winston");
const path = require("path");

const { combine, timestamp, printf, colorize } = winston.format;

const fileFormat = combine(
  timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  printf(({ level, message, timestamp }) =>
    `${timestamp} [${level.toUpperCase()}] ${message}`
  )
);

const consoleFormat = combine(
  colorize(),
  printf(({ level, message }) => `${level}: ${message}`)
);

function createLogger(name, { console: withConsole = false } = {}) {
  const transports = [
    new winston.transports.File({
      filename: path.join(__dirname, `../logs/${name}.log`),
      format: fileFormat,
    }),
    new winston.transports.File({
      filename: path.join(__dirname, `../logs/error.log`),
      level: "error",
      format: fileFormat,
    }),
  ];

  transports.push(
    new winston.transports.Console({
      level: withConsole ? "info" : "error",
      format: consoleFormat,
    })
  );

  return winston.createLogger({ transports });
}

module.exports = { createLogger };
