#!/usr/bin/env node
import Queue from 'bull';
import IORedis from 'ioredis';
import logger from '../src/utils/logger.js';
import { env } from '../src/config/env.js';

// Create a synchronous client factory for Queue but do NOT call .process()
const createClient = (type) => {
  const opts = {
    host: env.redis?.host || '127.0.0.1',
    port: env.redis?.port || 6379,
    password: env.redis?.password || undefined,
    tls: env.redis?.tls ? {} : undefined,
    maxRetriesPerRequest: null,
  };

  if (type === 'subscriber' || type === 'bclient') {
    opts.enableReadyCheck = false;
  }

  return new IORedis(opts);
};

async function main() {
  try {
    logger.info('Pushing a test job (server worker should process)');
    const q = new Queue('emailQueue', { createClient });

    const job = await q.add({
      type: 'welcomeUser',
      to: 'push-test@example.com',
      context: { name: 'Push Test', verificationUrl: 'https://example.com/verify' },
      timestamp: Date.now(),
    });

    logger.info('Pushed test job', { jobId: job.id });
    process.exit(0);
  } catch (err) {
    logger.error('Failed to push test job', err);
    process.exit(1);
  }
}

main();
