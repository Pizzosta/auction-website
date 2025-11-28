import { addToQueue } from '../src/services/emailQueue.js';
import logger from '../src/utils/logger.js';

// Test email configuration
const TEST_EMAILS = [
  {
    type: 'welcome',
    to: 'test@example.com',
    context: {
      name: 'Test User',
      verificationUrl: 'https://example.com/verify?token=test-token'
    }
  },
  {
    type: 'passwordReset',
    to: 'test@example.com',
    context: {
      name: 'Test User',
      resetUrl: 'https://example.com/reset-password?token=test-token'
    }
  },
  {
    type: 'bidPlaced',
    to: 'seller@example.com',
    context: {
      name: 'Seller',
      itemName: 'Test Item',
      amount: 100,
      bidderName: 'Test Bidder',
      itemUrl: 'https://example.com/auctions/test-item'
    }
  }
];

async function testEmailSending() {
  try {
    logger.info('Starting email sending test...');
    
    // Send test emails
    const results = await Promise.all(
      TEST_EMAILS.map(async (email, index) => {
        try {
          const job = await addToQueue(email);
          logger.info(`Queued email ${index + 1}: ${email.type}`, { jobId: job.id });
          return { success: true, type: email.type, jobId: job.id };
        } catch (error) {
          logger.error(`Failed to queue email ${email.type}:`, error);
          return { success: false, type: email.type, error: error.message };
        }
      })
    );

    // Log results
    const successful = results.filter(r => r.success).length;
    logger.info(`Test complete. Successfully queued ${successful} of ${TEST_EMAILS.length} emails.`);

    if (successful < TEST_EMAILS.length) {
      const failed = results.filter(r => !r.success);
      logger.warn('Some emails failed to queue:', { failed });
    }

    process.exit(0);
  } catch (error) {
    logger.error('Error during email test:', error);
    process.exit(1);
  }
}

// Run the test
testEmailSending();