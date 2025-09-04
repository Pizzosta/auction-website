
import express from 'express';
import helmet from 'helmet';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import xss from 'xss';
import hpp from 'hpp';
import { env, validateEnv } from '../config/env.js';
import logger from '../utils/logger.js';
import { getRedisClient } from '../config/redis.js';

// Validate required environment variables
const missingVars = validateEnv();
if (missingVars.length > 0) {
  logger.error(`Missing required environment variables: ${missingVars.join(', ')}`);
  process.exit(1);
}

// Optionally load RedisStore from rate-limit-redis (fallback to memory if unavailable)
let RedisStoreCtor = null;
try {
  const mod = await import('rate-limit-redis');
  RedisStoreCtor = mod.RedisStore || mod.default || null;
  if (RedisStoreCtor) {
    logger.info('rate-limit-redis detected; Redis-backed rate limiting enabled');
  }
} catch (e) {
  logger.info('rate-limit-redis not installed; using in-memory rate limiting');
}

// Rate limiter factory
const createRateLimiter = ({
  windowMs = env.rateLimit.windowMs || 15 * 60_000, // 15 minutes
  max = env.rateLimit.max || 100, // limit each IP to 100 requests per windowMs
  message = 'Too many requests, please try again later.',
  keyByUser = false,
  logAbuse = true,
  skipFailedRequests = false, // Don't count failed requests against the limit
} = {}) => {
  const options = {
    windowMs,
    max,
    keyGenerator: (req, res) => (keyByUser && req.user?.id) ? req.user.id : ipKeyGenerator(req, res),
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false,  // Disable the `X-RateLimit-*` headers
    message,
    handler: (req, res, _next, options) => {
      if (logAbuse) {
        logger.warn('Rate limit triggered', {
          method: req.method,
          path: req.originalUrl,
          ip: req.ip,
          userId: req.user?.id,
          windowMs: options.windowMs,
          max,
          timestamp: new Date().toISOString(),
        });
      }
      res.status(options.statusCode).json({ message: options.message });
    },
  };

  // Attach Redis store if available
  if (RedisStoreCtor) {
    const sendCommand = async (...args) => {
      const client = await getRedisClient();
      // If client is null, throw to make the failure explicit and surface in logs
      if (!client) throw new Error('Redis client unavailable');
      try {
        return await client.sendCommand(args);
      } catch (err) {
        logger.error('Redis command failed:', { error: err.message, command: args[0] });
        throw err; // Re-throw to let the rate limiter handle it
      }
    };

    options.store = new RedisStoreCtor({ 
      sendCommand,
      prefix: 'rl:',
      // Add a small delay to help with race conditions
      // This helps prevent race conditions by adding a small delay between retries
      retryStrategy: (times) => Math.min(times * 50, 200) // 50ms, 100ms, 150ms, 200ms, 200ms...
    });
  }

  // Add a small delay to help with race conditions in testing
  if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') {
    options.delayMs = 1; // 1ms delay to help with race conditions in testing
  }
  
  return rateLimit({
    ...options,
    skipFailedRequests, // Don't count failed requests against the limit
  });
};

// Presets for common use-cases
const presets = {
  otp: {
    windowMs: env.rateLimit.otp.windowMs || env.rateLimit.windowMs || 60_000,
    max:      env.rateLimit.otp.max      || env.rateLimit.max      || 3,
    message:  'Too many OTP requests, please try again later.',
  },

  login: {
    windowMs: env.rateLimit.login.windowMs || env.rateLimit.windowMs || 15 * 60_000,
    max:      env.rateLimit.login.max      || env.rateLimit.max      || 10,
    message:  'Too many login attempts, please try again later.',
  },

  forgotPassword: {
    windowMs: env.rateLimit.forgotPassword.windowMs || env.rateLimit.windowMs || 5 * 60_000,
    max:      env.rateLimit.forgotPassword.max      || env.rateLimit.max      || 5,
    message:  'Too many forgot-password requests, please try again later.',
  },
};

// Exported specific limiters
export const forgotLimiter = createRateLimiter({ ...presets.forgotPassword, keyByUser: true });
export const loginLimiter = createRateLimiter(presets.login);
export const otpLimiter = createRateLimiter({ ...presets.otp, keyByUser: true });

// Security middleware stack
const securityMiddleware = [
  // Set security HTTP headers
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'trusted-cdn.com'],
        styleSrc: ["'self'", 'trusted-cdn.com', "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://www.trusted-cdn.com'],
        connectSrc: ["'self'", 'api.trusted-service.com'],
        fontSrc: ["'self'", 'trusted-cdn.com'],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false,
    frameguard: { action: 'deny' },
    hidePoweredBy: true,
    hsts: {
      maxAge: 60 * 60 * 24 * 365, // 1 year in seconds
      includeSubDomains: true,
      preload: true,
    },
    ieNoOpen: true,
    noSniff: true,
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },
    referrerPolicy: { policy: 'no-referrer' },
  }),

  // Limit requests from same API
  createRateLimiter(),

  // Body parser
  express.json({ limit: '10kb' }),

  // Data sanitization against XSS
  (req, res, next) => {
    // Skip XSS for versioned webhook endpoints (e.g., /api/v1/webhook, /api/v2/webhook)
    if (/^\/api\/v\d+\/webhook\/?$/.test(req.path)) return next();
    
    // Sanitize request body, query, and params
    const sanitizeInput = (data) => {
      if (!data || typeof data !== 'object') return data;
      
      Object.keys(data).forEach(key => {
        if (typeof data[key] === 'string') {
          data[key] = xss(data[key]);
        } else if (data[key] !== null && typeof data[key] === 'object') {
          sanitizeInput(data[key]);
        }
      });
      
      return data;
    };
    
    sanitizeInput(req.body);
    sanitizeInput(req.query);
    sanitizeInput(req.params);
    
    next();
  },

  // Prevent parameter pollution
  hpp({
    whitelist: [
      'duration',
      'ratingsQuantity',
      'ratingsAverage',
      'maxGroupSize',
      'difficulty',
      'price',
    ],
  }),

  // Basic CORS
  (req, res, next) => {
    res.header('Access-Control-Allow-Origin', process.env.CLIENT_URL || '*');
    res.header(
      'Access-Control-Allow-Headers',
      'Origin, X-Requested-With, Content-Type, Accept, Authorization'
    );
    res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }

    next();
  },
];

export default securityMiddleware;
