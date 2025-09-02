#!/usr/bin/env node
import nodemailer from 'nodemailer';
import emailConfig from '../src/config/email.js';
import { env } from '../src/config/env.js';
import logger from '../src/utils/logger.js';

(async () => {
  try {
    const smtp = emailConfig.getSmtpConfig();

    // Show DKIM configuration status
    const dkimActive = Boolean(smtp.dkim && smtp.dkim.privateKey);
    logger.info('DKIM configuration', {
      active: dkimActive,
      domain: smtp.dkim?.domainName || null,
      selector: smtp.dkim?.keySelector || null,
      source: smtp.dkim?._source || null,
    });

    const to = process.argv[2] || env.email.supportEmail || env.email.from;
    if (!to) {
      throw new Error('Recipient not specified. Pass an email as an argument or set SUPPORT_EMAIL/EMAIL_FROM');
    }

    const subject = `DKIM Test Email ${new Date().toISOString()}`;
    const html = `<p>This is a DKIM test email from <b>${env.email.appName || 'App'}</b>.</p>`;

    const info = await emailConfig.transporter.sendMail({
      from: `"${emailConfig.from.name}" <${emailConfig.from.address}>`,
      to,
      subject,
      html,
      text: 'This is a DKIM test email.',
      headers: {
        'X-DKIM-Test': 'true',
      },
    });

    logger.info('Email sent', {
      messageId: info.messageId,
      envelope: info.envelope,
      accepted: info.accepted,
      rejected: info.rejected,
      response: info.response,
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      logger.info('Preview URL (Ethereal):', { url: previewUrl });
      logger.info('Open the message in Ethereal and check for a DKIM-Signature header.');
    } else {
      logger.info('Preview URL not available. Check your mailbox headers for DKIM-Signature.');
    }

    // Basic local verification (pre-flight): if DKIM config exists we expect DKIM to be applied by nodemailer
    if (!dkimActive) {
      logger.warn('DKIM not active. Ensure DKIM keys and selector/domain are configured.');
      process.exitCode = 2;
    } else {
      logger.info('DKIM appears configured. Verify on the received email headers.');
    }
  } catch (err) {
    logger.error('Failed to send DKIM test email', { error: err.message });
    process.exit(1);
  }
})();
