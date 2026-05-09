const winston = require("winston");
const path = require("path");
const { sendMessage } = require("./telegram");

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

function createLogger(nameOrFile, { console: withConsole = false } = {}) {
  const name = path.basename(nameOrFile, path.extname(nameOrFile));
  const MAX_SIZE = 1 * 1024 * 1024 * 1024; // 1GB

  const transports = [
    new winston.transports.File({
      filename: path.join(__dirname, `../logs/${name}.log`),
      format: fileFormat,
      maxsize: MAX_SIZE,
      maxFiles: 3,
      tailable: true,
    }),
    new winston.transports.File({
      filename: path.join(__dirname, `../logs/error.log`),
      level: "error",
      format: fileFormat,
      maxsize: MAX_SIZE,
      maxFiles: 3,
      tailable: true,
    }),
  ];

  transports.push(
    new winston.transports.Console({
      level: withConsole ? "info" : "error",
      format: consoleFormat,
      stderrLevels: [],
    })
  );

  const logger = winston.createLogger({ transports });

  const originalError = logger.error.bind(logger);
  logger.error = (message, ...args) => {
    console.error(`[${name}] ERROR:`, message, ...args);
    sendMessage(`<b>${name} error</b>\n${message}`).catch(() => {});
    return originalError(message, ...args);
  };

  return logger;
}

module.exports = { createLogger };
