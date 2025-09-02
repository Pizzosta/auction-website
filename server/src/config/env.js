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
  'JWT_EXPIRE',
  'RESET_TOKEN_EXPIRE',
  'WEBHOOK_SECRET',
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
  'DKIM_PRIVATE_KEY',
  'DKIM_KEY_PATH',
  'DKIM_DOMAIN',
  'DKIM_SELECTOR',
  'REDIS_HOST',
  'REDIS_PORT',
  'DEFAULT_RATE_LIMIT_WINDOW_MS',
  'DEFAULT_RATE_LIMIT_MAX',
];

export function validateEnv(requiredVars = DEFAULT_REQUIRED_VARS) {
  const missing = requiredVars.filter((name) => !process.env[name] || String(process.env[name]).trim() === '');
  return missing;
}

// Provide a typed-ish config object to import elsewhere
export const env = {
  nodeEnv: process.env.NODE_ENV,
  isProd: process.env.NODE_ENV === 'production',
  isDev: process.env.NODE_ENV === 'development',
  isTest: process.env.NODE_ENV === 'test',

  port: parseInt(process.env.PORT, 10) || 3000,
  clientUrl: process.env.CLIENT_URL,

  mongodbUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpire: process.env.JWT_EXPIRE, // e.g., '7d' or seconds
  resetTokenExpire: process.env.RESET_TOKEN_EXPIRE, // e.g., minutes or ISO duration
  webhookSecret: process.env.WEBHOOK_SECRET,

  redis: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : undefined,
  },

  rateLimit: {
    // generic fallback
    windowMs: process.env.DEFAULT_RATE_LIMIT_WINDOW_MS ? parseInt(process.env.DEFAULT_RATE_LIMIT_WINDOW_MS, 10) : undefined,
    max: process.env.DEFAULT_RATE_LIMIT_MAX ? parseInt(process.env.DEFAULT_RATE_LIMIT_MAX, 10) : undefined,

    // specific overrides
    otp: {
      windowMs: process.env.OTP_RATE_LIMIT_WINDOW_MS ? parseInt(process.env.OTP_RATE_LIMIT_WINDOW_MS, 10) : undefined,
      max: process.env.OTP_RATE_LIMIT_MAX ? parseInt(process.env.OTP_RATE_LIMIT_MAX, 10) : undefined,
    },
    login: {
      windowMs: process.env.LOGIN_RATE_LIMIT_WINDOW_MS ? parseInt(process.env.LOGIN_RATE_LIMIT_WINDOW_MS, 10) : undefined,
      max: process.env.LOGIN_RATE_LIMIT_MAX ? parseInt(process.env.LOGIN_RATE_LIMIT_MAX, 10) : undefined,
    },
    forgotPassword: {
      windowMs: process.env.FORGOTPASSWORD_RATE_LIMIT_WINDOW_MS ? parseInt(process.env.FORGOTPASSWORD_RATE_LIMIT_WINDOW_MS, 10) : undefined,
      max: process.env.FORGOTPASSWORD_RATE_LIMIT_MAX ? parseInt(process.env.FORGOTPASSWORD_RATE_LIMIT_MAX, 10) : undefined,
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
      privateKey: process.env.DKIM_PRIVATE_KEY,
      keyPath: process.env.DKIM_KEY_PATH,
      domain: process.env.DKIM_DOMAIN,
      selector: process.env.DKIM_SELECTOR,
    },
  },
};
