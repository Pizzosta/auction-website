import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import xss from 'xss';
import hpp from 'hpp';
import { env, validateEnv } from '../config/env.js';
import logger from '../utils/logger.js';

// Validate required environment variables
const missingVars = validateEnv();
if (missingVars.length > 0) {
  logger.error(`Missing required environment variables: ${missingVars.join(', ')}`);
  process.exit(1);
}

// Rate limiting
const limiter = rateLimit({
  windowMs: env.rateLimit.windowMs || 15 * 60 * 1000, // 15 minutes
  max: env.rateLimit.max || 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
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
  limiter,

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
