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
  'WEBHOOK_SECRET',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
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
  webhookSecret: process.env.WEBHOOK_SECRET,

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
