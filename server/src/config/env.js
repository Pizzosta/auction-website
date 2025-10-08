import dotenv from 'dotenv';

// Load environment variables from .env once
dotenv.config();

// Default list of required environment variables for server startup
const DEFAULT_REQUIRED_VARS = [
  'MONGODB_URI',
  'JWT_SECRET',
  'NODE_ENV',
  'PORT',
  'CLIENT_URL',
  'JWT_SECRET',
  'JWT_EXPIRE',
  'ACCESS_TOKEN_EXPIRY',
  'REFRESH_TOKEN_EXPIRY',
  'RESET_TOKEN_EXPIRE',
  'WEBHOOK_SECRET',
  'COOKIE_SECRET',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'EMAIL_HOST',
  'EMAIL_USER',
  'EMAIL_PASS',
  'EMAIL_PORT',
  'EMAIL_SECURE',
  'EMAIL_FROM',
  'EMAIL_FROM_NAME',
  'APP_NAME',
  'SUPPORT_EMAIL',
  'DKIM_KEY_PATH',
  'DKIM_DOMAIN',
  'DKIM_SELECTOR',
  'REDIS_HOST',
  'REDIS_PORT',
  'DEFAULT_RATE_LIMIT_WINDOW_MS',
  'DEFAULT_RATE_LIMIT_MAX',
  'VERIFICATION_TOKEN_EXPIRE',
  'AUCTION_EXTENSION_MINUTES',
];

export function validateEnv(requiredVars = DEFAULT_REQUIRED_VARS) {
  const missing = requiredVars.filter(
    name => !process.env[name] || String(process.env[name]).trim() === ''
  );
  return missing;
}

// Provide a typed-ish config object to import elsewhere
export const env = {
  nodeEnv: process.env.NODE_ENV,
  isProd: process.env.NODE_ENV === 'production',
  isDev: process.env.NODE_ENV === 'development',
  isTest: process.env.NODE_ENV === 'test',

  port: parseInt(process.env.PORT, 10) || 5001,
  clientUrl: process.env.CLIENT_URL,

  mongodbUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpire: process.env.JWT_EXPIRE,
  accessTokenExpiry: process.env.ACCESS_TOKEN_EXPIRY,
  refreshTokenExpiry: process.env.REFRESH_TOKEN_EXPIRY,
  resetTokenExpire: process.env.RESET_TOKEN_EXPIRE,
  verificationTokenExpire: process.env.VERIFICATION_TOKEN_EXPIRE,
  webhookSecret: process.env.WEBHOOK_SECRET,
  cookieSecret: process.env.COOKIE_SECRET,
  auctionExtensionMinutes: process.env.AUCTION_EXTENSION_MINUTES,

  redis: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : undefined,
    password: process.env.REDIS_PASSWORD || undefined,
    tls: process.env.REDIS_TLS ? process.env.REDIS_TLS === 'true' : undefined,
  },

  // Helper function to safely evaluate expressions in env vars
  _evaluateValue: value => {
    if (!value) return undefined;
    try {
      // Replace _ with nothing to handle numbers like 60_000
      const cleanValue = String(value).replace(/_/g, '');
      // Use Function constructor to evaluate the expression safely
      return new Function(`return ${cleanValue}`)();
    } catch (e) {
      console.error('Error evaluating value:', value, e);
      return undefined;
    }
  },

  rateLimit: {
    // generic fallback
    windowMs: process.env.DEFAULT_RATE_LIMIT_WINDOW_MS
      ? (() => {
          const value = String(process.env.DEFAULT_RATE_LIMIT_WINDOW_MS).replace(/_/g, '');
          return new Function(`return ${value}`)();
        })()
      : 60 * 1000, // Default to 1 minute

    max: process.env.DEFAULT_RATE_LIMIT_MAX
      ? parseInt(process.env.DEFAULT_RATE_LIMIT_MAX, 10)
      : 100, // Increased to 100 for better UX

    // specific overrides
    otp: {
      windowMs: process.env.OTP_RATE_LIMIT_WINDOW_MS
        ? (() => {
            const value = String(process.env.OTP_RATE_LIMIT_WINDOW_MS).replace(/_/g, '');
            return new Function(`return ${value}`)();
          })()
        : 60 * 1000, // Default to 1 minute
      max: process.env.OTP_RATE_LIMIT_MAX ? parseInt(process.env.OTP_RATE_LIMIT_MAX, 10) : 3,
    },
    login: {
      windowMs: process.env.LOGIN_RATE_LIMIT_WINDOW_MS
        ? (() => {
            const value = String(process.env.LOGIN_RATE_LIMIT_WINDOW_MS).replace(/_/g, '');
            return new Function(`return ${value}`)();
          })()
        : 10 * 60 * 1000, // Default to 10 minutes
      max: process.env.LOGIN_RATE_LIMIT_MAX ? parseInt(process.env.LOGIN_RATE_LIMIT_MAX, 10) : 10,
    },
    forgotPassword: {
      windowMs: process.env.FORGOTPASSWORD_RATE_LIMIT_WINDOW_MS
        ? (() => {
            const value = String(process.env.FORGOTPASSWORD_RATE_LIMIT_WINDOW_MS).replace(/_/g, '');
            return new Function(`return ${value}`)();
          })()
        : 5 * 60 * 1000, // Default to 5 minutes
      max: process.env.FORGOTPASSWORD_RATE_LIMIT_MAX
        ? parseInt(process.env.FORGOTPASSWORD_RATE_LIMIT_MAX, 10)
        : 5,
    },
    verificationEmail: {
      windowMs: process.env.VERIFICATION_EMAIL_RATE_LIMIT_WINDOW_MS
        ? (() => {
            const value = String(process.env.VERIFICATION_EMAIL_RATE_LIMIT_WINDOW_MS).replace(/_/g, '');
            return new Function(`return ${value}`)();
          })()
        : 10 * 60 * 1000, // Default to 10 minutes
      max: process.env.VERIFICATION_EMAIL_RATE_LIMIT_MAX
        ? parseInt(process.env.VERIFICATION_EMAIL_RATE_LIMIT_MAX, 10)
        : 10,
    },
    bid: {
      windowMs: process.env.BID_RATE_LIMIT_WINDOW_MS
        ? (() => {
            const value = String(process.env.BID_RATE_LIMIT_WINDOW_MS).replace(/_/g, '');
            return new Function(`return ${value}`)();
          })()
        : 60 * 1000, // Default to 1 minute
      max: process.env.BID_RATE_LIMIT_MAX ? parseInt(process.env.BID_RATE_LIMIT_MAX, 10) : 10,
    },
  },

  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },

  email: {
    host: process.env.EMAIL_HOST,
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
    port: process.env.EMAIL_PORT ? parseInt(process.env.EMAIL_PORT, 10) : undefined,
    secure: process.env.EMAIL_SECURE === 'true',
    from: process.env.EMAIL_FROM,
    fromName: process.env.EMAIL_FROM_NAME,
    appName: process.env.APP_NAME,
    supportEmail: process.env.SUPPORT_EMAIL,
    dkim: {
      keyPath: process.env.DKIM_KEY_PATH,
      domain: process.env.DKIM_DOMAIN,
      selector: process.env.DKIM_SELECTOR,
    },
  },
};
