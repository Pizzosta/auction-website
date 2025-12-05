#!/usr/bin/env node
import logger from '../src/utils/logger.js';
import { addToQueue } from '../src/services/emailQueueService.js';

async function main() {
  try {
    logger.info('Enqueue test: creating welcomeUser job');

    const job = await addToQueue('welcomeUser', 'test-recipient@example.com', {
      name: 'Test Recipient',
      verificationUrl: 'https://example.com/verify?token=test-token'
    });

    logger.info('Enqueued test email job', { jobId: job.id });
    process.exit(0);
  } catch (err) {
    logger.error('Failed to enqueue test email', err);
    process.exit(1);
  }
}

main();
