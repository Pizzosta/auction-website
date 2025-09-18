import express from 'express';
import helmet from 'helmet';
import xss from 'xss';
import hpp from 'hpp';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import csrf from 'csurf';
import { env, validateEnv } from '../config/env.js';
import logger from '../utils/logger.js';
import { getRedisClient } from '../config/redis.js';
import { apiLogger, errorLogger } from './apiLogger.js';

// Validate required environment variables
const missingVars = validateEnv();
if (missingVars.length > 0) {
  logger.error(`Missing required environment variables: ${missingVars.join(', ')}`);
  process.exit(1);
}

// Presets for common use-cases
const presets = {
  otp: {
    windowMs: env.rateLimit.otp.windowMs || env.rateLimit.windowMs || 60_000,
    max: env.rateLimit.otp.max || env.rateLimit.max || 3,
    message: 'Too many OTP requests, please try again later.',
  },

  login: {
    windowMs: env.rateLimit.login.windowMs || env.rateLimit.windowMs || 15 * 60_000,
    max: env.rateLimit.login.max || env.rateLimit.max || 10,
    message: 'Too many login attempts, please try again later.',
  },

  forgotPassword: {
    windowMs: env.rateLimit.forgotPassword.windowMs || env.rateLimit.windowMs || 5 * 60_000,
    max: env.rateLimit.forgotPassword.max || env.rateLimit.max || 5,
    message: 'Too many forgot-password requests, please try again later.',
  },

  bid: {
    windowMs: env.rateLimit.bid.windowMs || env.rateLimit.windowMs || 60_000,
    max: env.rateLimit.bid.max || env.rateLimit.max || 10,
    message: 'Too many bid requests, please try again later.',
  },
};

// Helper function to create a rate limiter that uses Redis when available, falls back to in-memory
const createRateLimiter = (options = {}) => {
  const {
    windowMs = env.rateLimit.windowMs || 15 * 60_000, // 15 minutes
    max = env.rateLimit.max || 1000, // limit each IP to 1000 requests per windowMs
    message = 'Too many requests, please try again later.',
    keyGenerator = req => {
      // Simple IP-based key
      const ip = req.ip || req.connection.remoteAddress || 'unknown-ip';
      return ip.replace(/[:.]/g, '-');
    },
    keyPrefix = 'rate-limit:',
    logAbuse = true,
  } = options;

  // Redis client holder; resolved lazily per-request
  let redisClient = null;

  // In-memory store fallback
  const memoryStore = new Map();
  const memoryLocks = new Map();

  // Generate a unique key for Redis
  const getRedisKey = key => `rl:${keyPrefix}${key}`;

  // Define in-memory fallback before redis handler so it can be referenced
  const memoryRateLimit = async (req, res, next) => {
    const key = keyGenerator(req);
    const now = Date.now();

    if (!memoryStore.has(key)) {
      memoryStore.set(key, {
        totalHits: 0,
        resetTime: now + windowMs,
      });
    }

    const entry = memoryStore.get(key);

    if (entry.resetTime <= now) {
      entry.totalHits = 0;
      entry.resetTime = now + windowMs;
    }

    entry.totalHits++;

    res.set({
      'X-RateLimit-Limit': max,
      'X-RateLimit-Remaining': Math.max(0, max - entry.totalHits),
      'X-RateLimit-Reset': Math.ceil(entry.resetTime / 1000),
      'X-RateLimit-Backend': 'memory',
    });

    if (entry.totalHits > max) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      res.set('Retry-After', retryAfter);
      res.set('X-RateLimit-Backend', 'memory');

      if (logAbuse) {
        logger.warn('In-memory rate limit triggered', {
          method: req.method,
          path: req.originalUrl,
          ip: req.ip,
          userId: req.user?.id,
          windowMs,
          max,
          totalHits: entry.totalHits,
          timestamp: new Date().toISOString(),
        });
      }

      const minutes = Math.floor(retryAfter / 60);
      const seconds = retryAfter % 60;
      const timeRemaining =
        minutes > 0
          ? `${minutes} minute${minutes !== 1 ? 's' : ''} and ${seconds} second${seconds !== 1 ? 's' : ''}`
          : `${seconds} second${seconds !== 1 ? 's' : ''}`;

      return res.status(429).json({
        success: false,
        message: `${message} Please try again in ${timeRemaining}.`,
        status: 'error',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: timeRemaining,
        retryAfterSeconds: retryAfter,
      });
    }

    next();
  };

  // Redis-based rate limiting
  const redisRateLimit = async (req, res, next) => {
    // Ensure Redis client is available and connected
    if (!redisClient || !redisClient.isOpen) {
      try {
        redisClient = await getRedisClient();
      } catch (error) {
        logger.error('Redis unavailable, falling back to in-memory rate limiting', {
          error: error?.message,
        });
        return memoryRateLimit(req, res, next);
      }
    }
    const key = keyGenerator(req);
    const redisKey = getRedisKey(key);
    const now = Date.now();
    const resetTime = now + windowMs;

    try {
      // Use a lock to prevent race conditions
      if (memoryLocks.has(redisKey)) {
        // If we're already processing this key, wait a bit and retry
        await new Promise(resolve => setTimeout(resolve, 10));
        return redisRateLimit(req, res, next);
      }

      memoryLocks.set(redisKey, true);

      // Get current count and reset time from Redis
      const [count, reset] = await Promise.all([
        redisClient.get(redisKey),
        redisClient.get(`${redisKey}:reset`),
      ]);

      const currentCount = parseInt(count, 10) || 0;
      const resetTimeMs = parseInt(reset, 10) || 0;

      // Reset counter if window has passed
      const shouldReset = resetTimeMs <= now;
      const newCount = shouldReset ? 1 : currentCount + 1;

      // Set new values in Redis
      if (shouldReset) {
        await Promise.all([
          redisClient.set(redisKey, '1', { PX: windowMs, NX: true }),
          redisClient.set(`${redisKey}:reset`, String(resetTime), { PX: windowMs, NX: true }),
        ]);
      } else {
        await redisClient.incr(redisKey);
      }

      // Set rate limit headers
      const remaining = Math.max(0, max - newCount);
      res.set({
        'X-RateLimit-Limit': max,
        'X-RateLimit-Remaining': remaining,
        'X-RateLimit-Reset': Math.ceil((shouldReset ? resetTime : resetTimeMs) / 1000),
        'X-RateLimit-Backend': 'redis',
      });

      // Check if rate limit is exceeded
      if (newCount > max) {
        const retryAfterSeconds = shouldReset
          ? Math.ceil(windowMs / 1000)
          : Math.max(1, Math.ceil((resetTimeMs - now) / 1000));
        res.set('Retry-After', retryAfterSeconds);
        res.set('X-RateLimit-Backend', 'redis');

        if (logAbuse) {
          logger.warn('Redis rate limit triggered', {
            method: req.method,
            path: req.originalUrl,
            ip: req.ip,
            userId: req.user?.id,
            key: redisKey,
            count: newCount,
            max,
            retryAfterSeconds,
            timestamp: new Date().toISOString(),
          });
        }

        const minutes = Math.floor(retryAfterSeconds / 60);
        const seconds = retryAfterSeconds % 60;
        const timeRemaining =
          minutes > 0
            ? `${minutes} minute${minutes !== 1 ? 's' : ''} and ${seconds} second${seconds !== 1 ? 's' : ''}`
            : `${seconds} second${seconds !== 1 ? 's' : ''}`;

        return res.status(429).json({
          success: false,
          message: `${message} Please try again in ${timeRemaining}.`,
          status: 'error',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: timeRemaining,
          retryAfterSeconds,
        });
      }

      next();
    } catch (error) {
      // If Redis fails, fall back to in-memory
      logger.error('Redis rate limiting failed, falling back to in-memory:', error);
      memoryRateLimit(req, res, next);
    } finally {
      memoryLocks.delete(redisKey);
    }
  };

  // (memoryRateLimit defined above)

  // Always use the Redis-aware limiter; it falls back to memory internally
  return redisRateLimit;
};

// Exported specific limiters
export const forgotLimiter = createRateLimiter({
  ...presets.forgotPassword,
  keyPrefix: 'forgot-password:',
});

export const loginLimiter = createRateLimiter({
  ...presets.login,
  keyByUser: false, // Use IP-based limiting
  keyGenerator: req => `login:${req.ip}`, // Explicit key for login
});

export const otpLimiter = createRateLimiter({
  ...presets.otp,
  keyByUser: false, // Use IP-based limiting
  keyGenerator: req => `otp:${req.ip}`, // Explicit key for OTP
});

export const bidLimiter = createRateLimiter({
  ...presets.bid,
  // Rate limit per user per auction to avoid blocking a user from bidding on different auctions
  keyByUser: false,
  keyGenerator: req => {
    const userId = req.user?.id || 'anon';
    const auctionId =
      req.body?.auctionId || req.params?.auctionId || req.query?.auctionId || 'unknown';
    return `bid:${userId}:${auctionId}`;
  },
  // Do not count failed requests (e.g., validation errors) against the limit
  skipFailedRequests: true,
});

// CORS configuration
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, etc.)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      env.clientUrl,
      'http://localhost:5173',
      'https://kawodze.com', // Replace with your production domain
    ];

    if (allowedOrigins.includes(origin) || env.nodeEnv === 'development') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Allow cookies to be sent with requests
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'X-Access-Token',
    'X-Refresh-Token',
  ],
  exposedHeaders: ['Content-Range', 'X-Content-Range', 'Content-Length', 'X-Total-Count'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
};

// Security middleware stack
const securityMiddleware = [
  // Enable CORS with configuration
  cors(corsOptions),

  // Parse cookies
  cookieParser(env.cookieSecret),

  // API request/response logging
  apiLogger,

  // Parse JSON request body
  express.json({
    limit: '10kb',
    strict: true,
  }),

  // Parse URL-encoded request body
  express.urlencoded({
    extended: true,
    limit: '10kb',
    parameterLimit: 10, // Limit number of parameters
  }),

  // Set security HTTP headers with Helmet
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          'trusted-cdn.com',
          // Remove 'unsafe-inline' in production
          ...(env.nodeEnv === 'development' ? ["'unsafe-inline'"] : []),
        ],
        styleSrc: [
          "'self'",
          'trusted-cdn.com',
          // Remove 'unsafe-inline' in production
          ...(env.nodeEnv === 'development' ? ["'unsafe-inline'"] : []),
        ],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://www.trusted-cdn.com'],
        connectSrc: ["'self'", 'api.trusted-service.com'],
        fontSrc: ["'self'", 'trusted-cdn.com'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
        upgradeInsecureRequests: env.nodeEnv === 'production' ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: env.nodeEnv === 'production',
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'same-site' },
    dnsPrefetchControl: { allow: false },
    frameguard: { action: 'deny' },
    hidePoweredBy: true,
    hsts: {
      maxAge: 63072000, // 2 years in seconds
      includeSubDomains: true,
      preload: true,
    },
    ieNoOpen: true,
    noSniff: true,
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xssFilter: true,
  }),

  // CSRF protection for non-API routes and non-GET requests
  (req, res, next) => {
    // Skip CSRF for API routes, GET, HEAD, OPTIONS, and TRACE methods
    if (req.path.startsWith('/api/') || ['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(req.method)) {
      return next();
    }

    // Initialize CSRF protection
    const csrfProtection = csrf({
      cookie: {
        key: '_csrf',
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
      },
      value: req => req.body?._csrf || req.query?._csrf || req.headers['x-csrf-token'] || '',
    });

    // Apply CSRF protection
    csrfProtection(req, res, next);
  },

  // Add CSRF token to response locals for views
  (req, res, next) => {
    res.locals.csrfToken = req.csrfToken ? req.csrfToken() : '';
    next();
  },

  // Rate limiting
  createRateLimiter(),

  // Data sanitization against XSS
  (req, res, next) => {
    // Skip XSS for versioned webhook endpoints (e.g., /api/v1/webhook, /api/v2/webhook)
    if (/^\/api\/v\d+\/webhook\/?$/.test(req.path)) return next();

    // Sanitize request body, query, and params
    const sanitizeInput = data => {
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

  // Prevent parameter pollution with whitelist
  hpp({
    whitelist: [
      'duration',
      'ratingsQuantity',
      'ratingsAverage',
      'maxGroupSize',
      'difficulty',
      'price',
      // Add any other whitelisted parameters here
    ],
  }),

  // Trust first proxy if behind one (e.g., Heroku, AWS ELB, etc.)
  (req, res, next) => {
    if (env.nodeEnv === 'production' && req.headers['x-forwarded-proto'] === 'http') {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  },

  // Error logging
  errorLogger,

  // Handle OPTIONS requests
  (req, res, next) => {
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  },
];

// Add CSRF token to all API responses
export const addCsrfToken = (req, res, next) => {
  if (req.csrfToken) {
    res.setHeader('X-CSRF-Token', req.csrfToken());
  }
  next();
};

export default securityMiddleware;
