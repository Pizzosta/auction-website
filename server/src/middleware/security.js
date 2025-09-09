import express from 'express';
import helmet from 'helmet';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
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
  max = env.rateLimit.max || 1000, // limit each IP to 1000 requests per windowMs
  message = 'Too many requests, please try again later.',
  keyByUser = false,
  logAbuse = true,
  skipFailedRequests = false, // Don't count failed requests against the limit
} = {}) => {
  const options = {
    windowMs,
    max,
    keyGenerator: (req, res) =>
      keyByUser && req.user?.id ? req.user.id : ipKeyGenerator(req, res),
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
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
        // For Redis v4+, use client[command](...args) pattern
        return await client.sendCommand(args);
      } catch (err) {
        logger.error('Redis command failed:', {
          error: err.message,
          command: args[0],
          stack: err.stack,
        });
        throw err; // Re-throw to let the rate limiter handle it
      }
    };

    options.store = new RedisStoreCtor({
      sendCommand,
      prefix: 'rl:',
      // Add a small delay to help with race conditions
      retryStrategy: times => Math.min(times * 50, 200), // 50ms, 100ms, 150ms, 200ms, 200ms...
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
    windowMs: env.rateLimit.bid.windowMs || env.rateLimit.windowMs || 5 * 60_000,
    max: env.rateLimit.bid.max || env.rateLimit.max || 5,
    message: 'Too many bid requests, please try again later.',
  },
};

// Exported specific limiters
export const forgotLimiter = createRateLimiter({
  ...presets.forgotPassword,
  keyByUser: false, // Use IP-based limiting
  keyGenerator: req => `forgot-pwd:${req.ip}`, // Explicit key for forgot password
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
  keyByUser: true, // Use user-based limiting
  keyGenerator: req => `bid:${req.user.id}`, // Explicit key for bid
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
  exposedHeaders: [
    'Content-Range',
    'X-Content-Range',
    'Content-Length',
    'X-Total-Count',
  ],
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
      value: (req) => {
        // Extract CSRF token from body, query, or headers
        return (
          req.body?._csrf ||
          req.query?._csrf ||
          req.headers['x-csrf-token'] ||
          ''
        );
      },
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
