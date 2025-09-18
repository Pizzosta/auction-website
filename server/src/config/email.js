import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';
import { env, validateEnv } from './env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Validate required environment variables
const missingVars = validateEnv();
if (missingVars.length > 0) {
  logger.error(`Missing required environment variables: ${missingVars.join(', ')}`);
  process.exit(1);
}

// Default SMTP configuration for development
const DEFAULT_SMTP = {
  host: 'smtp.ethereal.email',
  port: 587,
  secure: false,
  auth: {
    user: 'billie.bergnaum37@ethereal.email',
    pass: 'rXYhCmGxQZ1DF4dHTj',
  },
  // Timeout configurations
  connectionTimeout: 30000, // 30 seconds
  greetingTimeout: 20000, // 20 seconds
  socketTimeout: 30000, // 30 seconds
  // Enable debug in development
  debug: env.isDev,
};

// Attempt to load DKIM configuration (supports env or file sources)
const loadDkimConfig = () => {
  try {
    const inlineKey = (env.email.dkim.privateKey || '').trim();
    const dkimKeyPath = env.email.dkim.keyPath || path.join(__dirname, 'keys/dkim-private.pem');
    const source = inlineKey ? 'env' : 'file';

    const dkimPrivateKey = inlineKey || fs.readFileSync(dkimKeyPath, 'utf8');

    // Derive domain from env or sender address if possible
    const fromAddress = env.email.from || '';
    const derivedDomain = fromAddress.includes('@') ? fromAddress.split('@')[1] : undefined;

    return {
      domainName: env.email.dkim.domain || derivedDomain || 'kawodze.com',
      keySelector: env.email.dkim.selector || 'default',
      privateKey: dkimPrivateKey,
      cacheDir: path.resolve('tmp/dkim'),
      keyBuffer: Buffer.from(dkimPrivateKey),
      skipFields: env.isProd ? '' : 'message-id:date',
      _source: source, // for debugging visibility only
    };
  } catch (error) {
    logger.warn('Failed to load DKIM private key. DKIM signing will be disabled.', {
      error: error.message,
      triedEnv: Boolean((env.email.dkim.privateKey || '').trim()),
      triedPath: env.email.dkim.keyPath || path.join(__dirname, 'keys/dkim-private.pem'),
    });
    return null;
  }
};

// Get SMTP config from environment or use defaults
const getSmtpConfig = () => {
  if (env.email.host && env.email.user && env.email.pass) {
    return {
      ...DEFAULT_SMTP,
      host: env.email.host,
      port: env.email.port || DEFAULT_SMTP.port,
      secure: env.email.secure,
      auth: {
        user: env.email.user,
        pass: env.email.pass,
      },
      // DKIM configuration
      dkim: loadDkimConfig(),
    };
  }

  if (env.isProd) {
    logger.warn('Using default SMTP configuration in production. This is not recommended.');
  } else {
    logger.info('Using development SMTP configuration');
  }

  // Attach DKIM in development/default mode too if the key exists
  return { ...DEFAULT_SMTP, dkim: loadDkimConfig() };
};

// Create and configure transporter
const createTransporter = () => {
  const smtpConfig = getSmtpConfig();
  const transporter = nodemailer.createTransport(smtpConfig);

  // Verify connection on startup
  transporter.verify(error => {
    if (error) {
      logger.error('Email transporter failed to connect:', error.message);
      if (env.isProd) {
        // In production, we might want to trigger an alert here
        // e.g., send a notification to monitoring service
      }
    } else {
      const dkimStatus = smtpConfig.dkim ? 'active' : 'inactive';
      logger.info(`Email transporter connected successfully (DKIM: ${dkimStatus})`);

      logger.debug('SMTP Configuration:', {
        host: smtpConfig.host,
        port: smtpConfig.port,
        secure: smtpConfig.secure,
        user: smtpConfig.auth.user,
        dkim: dkimStatus,
        ...(smtpConfig.dkim && {
          dkimDomain: smtpConfig.dkim.domainName,
          dkimSelector: smtpConfig.dkim.keySelector,
        }),
      });
    }
  });

  return transporter;
};

const emailConfig = {
  // Expose SMTP config for reference
  getSmtpConfig,

  // Initialize transporter
  transporter: createTransporter(),

  // Sender information
  from: {
    name: env.email.fromName || 'Kawodze Auctions',
    address: env.email.from || 'no-reply@kawodze.com',
  },

  // Email templates configuration
  templates: {
    dir: 'src/templates/emails', // Relative to project root
    viewEngine: 'handlebars',
  },

  // Default template variables
  templateVars: {
    appName: env.email.appName || 'Kawodze Auctions',
    appUrl: env.clientUrl || 'http://localhost:5173',
    year: new Date().getFullYear(),
    supportEmail: env.email.supportEmail || 'support@kawodze.com',
  },
};

export default emailConfig;
