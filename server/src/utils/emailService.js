import nodemailer from 'nodemailer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import handlebars from 'handlebars';
import emailConfig from '../config/email.js';
import logger from '../utils/logger.js';

/**
 * Detects if an email error is temporary/transient and can be retried
 * @param {Error} err - The error object from nodemailer
 * @returns {boolean} True if the error is temporary
 */
const isTemporaryEmailError = err => {
  if (!err) return false;
  const msg = (err.message || '').toLowerCase();
  const code = err.code ? err.code.toString().toLowerCase() : '';

  // Network / timeout related
  const networkIssues = [
    'timeout',
    'timed out',
    'connection reset',
    'econnreset',
    'econnrefused',
    'etimedout',
    'enotfound',
    'esockettimedout',
  ];

  // SMTP 4xx temporary failures
  const smtpTemporary = [
    '4.0.0', // Generic temporary failure
    '4.1.0', // Temporary address issue
    '4.2.0', // Mailbox full / temporarily unavailable
    '4.4.1', // Connection timed out
    '4.5.3', // Too many connections
    'try again later',
    'server busy',
  ];

  return (
    networkIssues.some(k => msg.includes(k) || code.includes(k)) ||
    smtpTemporary.some(k => msg.includes(k) || code.includes(k))
  );
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Compile email templates
const compileTemplate = async (templateName, context) => {
  // Go up one level from src/utils to src, then to templates/emails
  const templateDir = path.join(__dirname, '..', 'templates', 'emails');
  const filePath = path.join(templateDir, `${templateName}.hbs`);

  try {
    const source = fs.readFileSync(filePath, 'utf-8');
    const template = handlebars.compile(source);
    return template({ ...emailConfig.templateVars, ...context });
  } catch (error) {
    logger.error(`Error compiling email template ${templateName}:`, {
      error: error.message,
      filePath,
      templateDir,
      files: fs.readdirSync(templateDir) // Log available templates
    });
    throw new Error(`Failed to load email template: ${templateName}. ${error.message}`);
  }
};

export const sendEmail = async ({ to, subject, template, context = {}, retryCount = 0 }) => {
  const maxRetries = 2; // Maximum number of retry attempts
  const retryDelay = 2000; // 2 seconds delay between retries

  try {
    // In development, log the email being sent
    if (process.env.NODE_ENV === 'development') {
      logger.info(`Sending email (attempt ${retryCount + 1}/${maxRetries + 1}):`, {
        to,
        subject,
        template,
      });
    }

    // Use context from config and merge with provided context
    const emailContext = { ...context };

    // Compile email template
    const html = await compileTemplate(template, emailContext);

    // Send mail with defined transport object
    const info = await emailConfig.transporter.sendMail({
      from: `"${emailConfig.from.name}" <${emailConfig.from.address}>`,
      to,
      subject,
      html,
      text: html.replace(/<[^>]*>?/gm, ''), // Convert HTML to plain text
    });

    if (process.env.NODE_ENV === 'development') {
      const previewUrl = nodemailer.getTestMessageUrl(info);
      if (previewUrl) {
        logger.info(`Email sent. Preview URL: ${previewUrl}`);
      }
    }

    return { success: true, messageId: info.messageId };
  } catch (error) {
    const isTemporary = isTemporaryEmailError(error);
    const errorMessage = `Error sending email (${isTemporary ? 'temporary' : 'permanent'})`;

    logger.error(`${errorMessage}:`, error);

    // Only retry for temporary errors and if we haven't exceeded max retries
    if (isTemporary && retryCount < maxRetries) {
      logger.info(`Retrying in ${retryDelay}ms... (${retryCount + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      return sendEmail({ to, subject, template, context, retryCount: retryCount + 1 });
    }

    throw new Error(`${errorMessage}: ${error.message}`);
  }
};

// Email templates
const emailTemplates = {
  welcomeUser: {
    subject: 'Welcome to Kawodze Auctions!',
    template: 'welcomeUser',
  },
  resetPassword: {
    subject: 'Password Reset Request',
    template: 'resetPassword',
  },
  passwordResetConfirmation: {
    subject: 'Your Password Has Been Reset',
    template: 'passwordResetConfirmation',
  },
  auctionEndedSeller: {
    subject: 'Your Auction Has Ended',
    template: 'auctionEndedSeller',
  },
  auctionWon: {
    subject: 'Congratulations! You Won an Auction',
    template: 'auctionWon',
  },
  auctionEndedNoBids: {
    subject: 'Your Auction Ended With No Bids',
    template: 'auctionEndedNoBids',
  },
  auctionEndingReminder: {
    subject: 'Hurry! Auction Ending Soon',
    template: 'auctionEndingReminder',
  },
  auctionStarted: {
    subject: 'Auction Started: Your Item is Now Live!',
    template: 'auctionStarted',
  },
};

export const sendTemplateEmail = async (type, to, context = {}) => {
  const template = emailTemplates[type];
  if (!template) {
    const error = new Error(`Email template '${type}' not found. Available templates: ${Object.keys(emailTemplates).join(', ')}`);
    logger.error(error.message);
    throw error;
  }

  try {
    return await sendEmail({
      to,
      subject: template.subject,
      template: template.template,
      context,
    });
  } catch (error) {
    logger.error(`Failed to send ${type} email to ${to}:`, {
      error: error.message,
      stack: error.stack,
      context
    });
    throw error;
  }
};