import express from 'express';
import helmet from 'helmet';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import xss from 'xss';
import hpp from 'hpp';
import { env, validateEnv } from '../config/env.js';
import logger from '../utils/logger.js';
import getRedisClient from '../config/redis.js';

// Validate required environment variables
const missingVars = validateEnv();
if (missingVars.length > 0) {
  logger.error(`Missing required environment variables: ${missingVars.join(', ')}`);
  process.exit(1);
}

// Custom store for rate limiting that works with Bull
class CustomRedisStore {
  constructor(options = {}) {
    this.prefix = options.prefix || 'rate-limit:';
    this.client = getRedisClient;
    this.windowMs = options.windowMs || 60000; // Default 1 minute
    this.max = options.max || 100; // Default max requests
    
    // Bind methods to ensure 'this' context
    this.increment = this.increment.bind(this);
    this.decrement = this.decrement.bind(this);
    this.resetKey = this.resetKey.bind(this);
  }

  async increment(key, windowMs) {
    const keyWithPrefix = `${this.prefix}${key}`;
    const now = Date.now();
    const currentWindowMs = windowMs || this.windowMs;
    
    try {
      // Start a transaction
      const multi = this.client.multi();
      
      // Get current value and TTL
      multi.get(keyWithPrefix);
      multi.pttl(keyWithPrefix);
      
      const [[, current], [, ttl]] = await multi.exec();
      let counter = 1;
      
      // If key exists, increment the counter
      if (current !== null) {
        counter = parseInt(current, 10) + 1;
      }
      
      // Start a new transaction for setting the value and TTL
      const setMulti = this.client.multi();
      setMulti.set(keyWithPrefix, counter);
      
      // If this is a new key or the TTL is -1 (no expiry), set expiry
      if (current === null || ttl === -1) {
        setMulti.pexpire(keyWithPrefix, currentWindowMs);
      } else if (ttl < 1) {
        // If TTL is 0 or negative (key exists but has no expiry), set expiry
        setMulti.pexpire(keyWithPrefix, currentWindowMs);
      }
      
      await setMulti.exec();
      
      // Calculate reset time
      const resetTime = ttl > 0 
        ? new Date(now + ttl)
        : new Date(now + currentWindowMs);
      
      return {
        totalHits: counter,
        resetTime,
        remaining: Math.max(0, this.max - counter)
      };
      
    } catch (error) {
      logger.error('Rate limiter increment error:', {
        error: error.message,
        key: keyWithPrefix,
        windowMs: currentWindowMs,
        stack: error.stack
      });
      
      // On error, allow the request but log it
      return {
        totalHits: 1,
        resetTime: new Date(now + currentWindowMs),
        remaining: this.max - 1
      };
    }
  }

  async decrement(key) {
    const keyWithPrefix = `${this.prefix}${key}`;
    try {
      await this.client.decr(keyWithPrefix);
    } catch (error) {
      logger.error('Rate limiter decrement error:', {
        error: error.message,
        key: keyWithPrefix,
        stack: error.stack
      });
    }
  }

  async resetKey(key) {
    const keyWithPrefix = `${this.prefix}${key}`;
    try {
      await this.client.del(keyWithPrefix);
      return true;
    } catch (error) {
      logger.error('Rate limiter resetKey error:', {
        error: error.message,
        key: keyWithPrefix,
        stack: error.stack
      });
      return false;
    }
  }
}

// Default rate limiter settings (more permissive for general API routes)
const createRateLimiter = ({
  windowMs = 60_000, // 1 minute
  max = 100, // 100 requests per minute by default
  message = 'Too many requests, please try again later.',
  keyByUser = false,
  logAbuse = true,
  skipFailedRequests = false, // Don't count failed requests against the limit
} = {}) => {
  // Create a custom Redis store instance
  const customStore = new CustomRedisStore({
    prefix: 'rate-limit:'
  });
  
  return rateLimit({
    windowMs,
    max,
    store: redisStore,
    keyGenerator: (req, res) => keyByUser && req.user?.id ? req.user.id : ipKeyGenerator(req, res),
    standardHeaders: true,
    legacyHeaders: false,
    message,
    handler: (req, res, _next, options) => {
      if (logAbuse) {
        logger.warn('Rate limit triggered', {
          method: req.method,
          path: req.originalUrl,
          ip: req.ip,
          userId: req.user?.id,
          timestamp: new Date().toISOString(),
        });
      }
      res.status(options.statusCode).json({ message: options.message });
    },
    skipFailedRequests,
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

  bid: {
    windowMs: env.rateLimit.bid.windowMs || env.rateLimit.windowMs || 5 * 60_000,
    max:      env.rateLimit.bid.max      || env.rateLimit.max      || 5,
    message:  'Too many bid requests, please try again later.',
  },
};

// Exported specific limiters
export const forgotLimiter = createRateLimiter({ 
  ...presets.forgotPassword, 
  keyByUser: false, // Use IP-based limiting
  keyGenerator: (req) => `forgot-pwd:${req.ip}` // Explicit key for forgot password
});

export const loginLimiter = createRateLimiter({ 
  ...presets.login,
  keyByUser: false, // Use IP-based limiting
  keyGenerator: (req) => `login:${req.ip}` // Explicit key for login
});

export const otpLimiter = createRateLimiter({ 
  ...presets.otp, 
  keyByUser: false, // Use IP-based limiting
  keyGenerator: (req) => `otp:${req.ip}` // Explicit key for OTP
});

export const bidLimiter = createRateLimiter({ 
  ...presets.bid,
  keyByUser: true, // Use user-based limiting
  keyGenerator: (req) => `bid:${req.user.id}` // Explicit key for bid
});

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

