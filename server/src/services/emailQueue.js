import Queue from 'bull';
import IORedis from 'ioredis';
import logger from '../utils/logger.js';
import { sendTemplateEmail } from '../utils/emailService.js';
import { env } from '../config/env.js';

let emailQueue = null;

export async function getEmailQueue() {
  if (emailQueue) return emailQueue;

  // Bull v4 requires ioredis for proper pub/sub support with authentication
  // Use a factory function to create authenticated ioredis clients
  const redisConfig = {
    host: env.redis?.host || '127.0.0.1',
    port: env.redis?.port || 6379,
    password: env.redis?.password || undefined,
    tls: env.redis?.tls ? {} : undefined,
  };

  const createClient = type => {
    const opts = { ...redisConfig };
    // For subscriber/bclient roles, disable ready checks as Bull requires
    if (type === 'subscriber' || type === 'bclient') {
      opts.enableReadyCheck = false;
      opts.maxRetriesPerRequest = null;
    }
    logger.info(`Creating ioredis client for Bull role: ${type}`, {
      host: opts.host,
      port: opts.port,
      auth: !!opts.password,
    });
    return new IORedis(opts);
  };

  emailQueue = new Queue('emailQueue', {
    createClient,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 500,
      },
      removeOnComplete: true,
      removeOnFail: 50, // Keep last 50 failed jobs for inspection
    },
  });

  // Process jobs from the queue
  emailQueue.process(async job => {
    const { type, to, context = {} } = job.data;

    // Extract email from context if to is an object with an email property
    const recipientEmail = typeof to === 'object' && to !== null && 'email' in to ? to.email : to;

    logger.info(`Processing email job: ${job.id} - ${type} to ${recipientEmail}`);

    try {
      const result = await sendTemplateEmail(type, recipientEmail, {
        ...context,
        ...(typeof to === 'object' ? to : {}),
      });
      logger.info(`Email sent successfully: ${job.id} → ${recipientEmail}`);
      return result;
    } catch (error) {
      logger.error(`Failed to send email(${job.id}):`, error);
      throw error; // Let Bull handle retries
    }
  });

  // Handle queue events
  emailQueue.on('waiting', jobId => {
    logger.info(`Email job ${jobId} waiting`);
  });

  emailQueue.on('active', job => {
    logger.info(`Email job ${job.id} active`);
  });

  emailQueue.on('completed', job => {
    logger.info(`Email job ${job.id} completed`);
  });

  emailQueue.on('failed', (job, error) => {
    logger.error(`Email job ${job.id} failed:`, error);
  });

  emailQueue.on('error', error => {
    logger.error('Email queue error:', error);
  });

  try {
    // Wait for queue to be ready (Bull will create and connect its Redis clients)
    await emailQueue.isReady();
    logger.info('Email queue is ready');
  } catch (err) {
    logger.error('Email queue failed to become ready', { error: err?.message || err });
    throw err;
  }

  return emailQueue;
}

export const addToQueue = async (type, to, context = {}) => {
  const payload = { type, to, context, timestamp: Date.now() };
  logger.info('Queueing email job', { type, to });
  const queue = await getEmailQueue();
  return queue.add(payload);
};
