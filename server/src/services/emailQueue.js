import Queue from 'bull';
import logger from '../utils/logger.js';
import { sendTemplateEmail } from '../utils/emailService.js';
import { redisOptions } from '../config/redis.js';

// Create a new queue
const emailQueue = new Queue('email', {
  redis: redisOptions,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000, // 5 seconds
    },
    removeOnComplete: true,
    removeOnFail: 50, // Keep last 50 failed jobs for inspection
  },
});

// Process jobs from the queue
emailQueue.process(async (job) => {
  const { type, to, context = {} } = job.data;
  
  logger.info(`Processing email job: ${job.id} - ${type} to ${to}`);
  
  try {
    const result = await sendTemplateEmail(type, to, context);
    logger.info(`Email sent successfully: ${job.id}`);
    return result;
  } catch (error) {
    logger.error(`Failed to send email (${job.id}):`, error);
    throw error; // Let Bull handle retries
  }
});

// Handle queue events
emailQueue.on('completed', (job, result) => {
  logger.info(`Email job ${job.id} completed`);
});

emailQueue.on('failed', (job, error) => {
  logger.error(`Email job ${job.id} failed:`, error);
});

emailQueue.on('error', (error) => {
  logger.error('Email queue error:', error);
});

const addToQueue = async (type, to, context = {}) => {
  return emailQueue.add({
    type,
    to,
    context,
    timestamp: Date.now(),
  });
};

export { emailQueue, addToQueue };

export default {
  emailQueue,
  addToQueue,
};
