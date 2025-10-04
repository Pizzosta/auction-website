import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import morgan from 'morgan';
import { getRequestContext } from '../middleware/requestContext.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create logs directory if it doesn't exist
const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Custom format to inject requestId
const requestIdFormat = winston.format(info => {
  const context = getRequestContext();
  if (context.requestId) {
    info.requestId = context.requestId;
  }
  return info;
});

// Define log format
const logFormat = winston.format.combine(
  requestIdFormat(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: logFormat,
  defaultMeta: { service: 'auction-website' },
  transports: [
    // Write all logs with level `error` and below to `error.log`
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 5,
      tailable: true,
    }),
    // Write all logs with level `info` and below to `combined.log`
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true,
    }),
  ],
});

// Add console transport in non-production environments
if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
        winston.format.printf(({ level, message, requestId, ...meta }) => {
          // Safe stringify to avoid circular structure errors
          let safeMeta = '';
          if (Object.keys(meta).length) {
            const seen = new WeakSet();
            try {
              safeMeta = JSON.stringify(
                meta,
                (key, value) => {
                  if (typeof value === 'object' && value !== null) {
                    if (seen.has(value)) return '[Circular]';
                    seen.add(value);
                  }
                  return value;
                },
                2
              );
            } catch (err) {
              safeMeta = '[Unserializable meta]';
            }
          }
          return `${requestId || ''} ${level}: ${message} ${safeMeta}`;
        })
      ),
      level: 'debug',
    })
  );
}

// Create a Morgan token for requestId
morgan.token('requestId', req => req.requestId || 'no-id');

// Define Morgan format string
const morganFormat = ':requestId :method :url :status :res[content-length] - :response-time ms';

// Create a Morgan middleware that logs via Winston
export const httpLogger = morgan(morganFormat, {
  stream: {
    write: message => {
      logger.http(message.trim());
    },
  },
});

// Patch logger methods so requestId is always included (error, warn, info, etc.)
const levelsToPatch = ['error', 'warn', 'info', 'debug', 'http'];
for (const level of levelsToPatch) {
  const originalFn = logger[level].bind(logger);
  logger[level] = (msg, meta = {}) => {
    const context = getRequestContext();
    if (context?.requestId && !meta.requestId) {
      meta.requestId = context.requestId;
    }
    return originalFn(msg, meta);
  };
}

export default logger;
