import nodemailer from 'nodemailer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import handlebars from 'handlebars';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test account creation is handled by nodemailer directly

import logger from './logger.js';

// Create reusable transporter object using the default SMTP transport
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.ethereal.email',
  port: process.env.EMAIL_PORT || 587,
  secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER || 'user',
    pass: process.env.EMAIL_PASS || 'pass',
  },
});

// Compile email templates
const compileTemplate = async (templateName, context) => {
  const filePath = path.join(__dirname, '..', 'templates', 'emails', `${templateName}.hbs`);
  const source = fs.readFileSync(filePath, 'utf-8');
  const template = handlebars.compile(source);
  return template(context);
};

/**
 * Send an email
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject
 * @param {string} options.template - Name of the email template (without .hbs extension)
 * @param {Object} options.context - Data to be passed to the template
 * @returns {Promise<Object>} - Result of the email sending operation
 */
export const sendEmail = async ({ to, subject, template, context = {} }) => {
  try {
    // In development, use ethereal.email to preview emails
    if (process.env.NODE_ENV === 'development') {
      const testAccount = await nodemailer.createTestAccount();
      transporter.options.auth = {
        user: testAccount.user,
        pass: testAccount.pass,
      };
      // Log test account info for development
      logger.info('Ethereal test account created:', {
        user: testAccount.user,
        pass: testAccount.pass,
        web: 'https://ethereal.email',
      });
    }

    // Add common variables to context
    const emailContext = {
      ...context,
      year: new Date().getFullYear(),
      appName: process.env.APP_NAME || 'Auction Website',
      appUrl: process.env.CLIENT_URL || 'http://localhost:3000',
    };

    // Compile email template
    const html = await compileTemplate(template, emailContext);

    // Send mail with defined transport object
    const info = await transporter.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME || 'Auction Website'}" <${process.env.EMAIL_FROM || 'noreply@auction-website.com'}>`,
      to,
      subject,
      html,
      text: html.replace(/<[^>]*>?/gm, ''), // Convert HTML to plain text
    });

    if (process.env.NODE_ENV === 'development') {
      console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
    }

    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending email:', error);
    throw new Error('Failed to send email');
  }
};

// Email templates
const emailTemplates = {
  welcome: {
    subject: 'Welcome to Auction Website!',
    template: 'welcome',
  },
  resetPassword: {
    subject: 'Password Reset Request',
    template: 'resetPassword',
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
};

/**
 * Send a predefined email
 * @param {string} type - Type of email (e.g., 'welcome', 'resetPassword')
 * @param {string} to - Recipient email address
 * @param {Object} context - Data to be passed to the template
 * @returns {Promise<Object>} - Result of the email sending operation
 */
export const sendTemplateEmail = async (type, to, context = {}) => {
  const template = emailTemplates[type];
  if (!template) {
    throw new Error(`Email template '${type}' not found`);
  }

  return sendEmail({
    to,
    subject: template.subject,
    template: template.template,
    context,
  });
};
