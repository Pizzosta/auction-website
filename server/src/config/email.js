import nodemailer from 'nodemailer';
import logger from '../utils/logger.js';

// Default SMTP configuration for development
const DEFAULT_SMTP = {
  host: 'smtp.ethereal.email',
  port: 587,
  secure: false,
  auth: {
    user: 'eslcqauj67dpeag6@ethereal.email',
    pass: 'pabgW62TYtg37qmkPS',
  },
  // Timeout configurations
  connectionTimeout: 30000, // 30 seconds
  greetingTimeout: 20000,   // 20 seconds
  socketTimeout: 30000,     // 30 seconds
  // Enable debug in development
  debug: process.env.NODE_ENV === 'development',
};

// Get SMTP config from environment or use defaults
const getSmtpConfig = () => {
  if (process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    return {
      ...DEFAULT_SMTP,
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT, 10) || DEFAULT_SMTP.port,
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    };
  }
  
  if (process.env.NODE_ENV === 'production') {
    logger.warn('Using default SMTP configuration in production. This is not recommended.');
  } else {
    logger.info('Using development SMTP configuration');
  }
  
  return DEFAULT_SMTP;
};

// Create and configure transporter
const createTransporter = () => {
  const smtpConfig = getSmtpConfig();
  const transporter = nodemailer.createTransport(smtpConfig);
  
  // Verify connection on startup
  transporter.verify((error) => {
    if (error) {
      logger.error('Email transporter failed to connect:', error.message);
      if (process.env.NODE_ENV === 'production') {
        // In production, we might want to trigger an alert here
        // e.g., send a notification to monitoring service
      }
    } else {
      logger.info('Email transporter connected successfully');
      logger.debug('SMTP Configuration:', {
        host: smtpConfig.host,
        port: smtpConfig.port,
        secure: smtpConfig.secure,
        user: smtpConfig.auth.user,
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
    name: process.env.EMAIL_FROM_NAME || 'Kawodze Auctions',
    address: process.env.EMAIL_FROM || 'no-reply@kawodze-auctions.com',
  },
  
  // Email templates configuration
  templates: {
    dir: 'src/templates/emails',  // Relative to project root
    viewEngine: 'handlebars'
  },
  
  // Default template variables
  templateVars: {
    appName: process.env.APP_NAME || 'Kawodze Auctions',
    appUrl: process.env.CLIENT_URL || 'http://localhost:3000',
    year: new Date().getFullYear()
  }
};

export default emailConfig;
