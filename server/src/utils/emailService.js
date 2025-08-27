import nodemailer from 'nodemailer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import handlebars from 'handlebars';
import emailConfig from '../config/email.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import logger from './logger.js';

// Create reusable transporter object
let transporter = nodemailer.createTransport(emailConfig.smtp);

// Verify transporter connection
transporter.verify((error) => {
  if (error) {
    logger.error('Email transporter failed to connect:', error.message);
  } else {
    logger.info('Email transporter connected successfully');
  }
});

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
    logger.error(`Error compiling email template ${templateName}:`, error);
    throw new Error(`Failed to load email template: ${templateName}`);
  }
};

export const sendEmail = async ({ to, subject, template, context = {} }) => {
  try {
    // In development, log the email being sent
    if (process.env.NODE_ENV === 'development') {
      logger.info('Sending email:', { to, subject, template });
    }
    
    // Use context from config and merge with provided context
    const emailContext = { ...context };

    // Compile email template
    const html = await compileTemplate(template, emailContext);

    // Send mail with defined transport object
    const info = await transporter.sendMail({
      from: `"${emailConfig.from.name}" <${emailConfig.from.address}>`,
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
    subject: 'Welcome to Kawodze Auctions!',
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
