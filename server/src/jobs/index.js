import cron from 'node-cron';
import {
  closeExpiredAuctions,
  cleanupOldData,
  sendAuctionEndingReminders,
} from '../utils/auctionCleanup.js';
import logger from '../utils/logger.js';
import { env } from '../config/env.js';

// Only schedule jobs if not in test or development environment
if (!env.isTest && !env.isDev) {
  // Run every minute to check for expired auctions
  cron.schedule('* * * * *', async () => {
    try {
      logger.info('Running auction expiration check...');
      const result = await closeExpiredAuctions();
      logger.info(`Auction expiration check completed: ${result.processed} auctions processed`);
    } catch (error) {
      logger.error('Error in auction expiration job:', error);
    }
  });

  // Run every hour to send auction ending reminders
  cron.schedule('0 * * * *', async () => {
    try {
      logger.info('Sending auction ending reminders...');
      const result = await sendAuctionEndingReminders();
      logger.info(`Auction ending reminders sent: ${result.reminded} auctions`);
    } catch (error) {
      logger.error('Error in auction ending reminders job:', error);
    }
  });

  // Run daily at midnight to clean up old data
  cron.schedule('0 0 * * *', async () => {
    try {
      logger.info('Running old data cleanup...');
      const result = await cleanupOldData();
      logger.info(`Old data cleanup completed: ${result.deletedCount} items removed`);
    } catch (error) {
      logger.error('Error in old data cleanup job:', error);
    }
  });

  logger.info('Scheduled jobs have been initialized');
} else {
  logger.info('Skipping job scheduling in test/dev environment');
}

export default cron;
