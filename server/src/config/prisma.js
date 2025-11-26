import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger.js';
import { env, validateEnv } from '../config/env.js';

// Validate required environment variables
const missingVars = validateEnv();
if (missingVars.length > 0) {
  logger.error(`Missing required environment variables: ${missingVars.join(', ')}`);
  process.exit(1);
}

let prisma;

// Ensure we reuse a single PrismaClient in dev (hot-reload friendly)
if (!env.isProd) {
  if (!global.__PRISMA_CLIENT__) {
    logger.info('Initializing new PrismaClient (dev mode)');
    global.__PRISMA_CLIENT__ = new PrismaClient();
  } else {
    logger.info('Reusing existing PrismaClient (dev mode)');
  }
  prisma = global.__PRISMA_CLIENT__;
} else {
  logger.info('Initializing PrismaClient (production mode)');
  prisma = new PrismaClient();
}

// Graceful shutdown
const shutdownSignals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];

shutdownSignals.forEach(signal => {
  process.on(signal, async () => {
    logger.info(`Received ${signal}, disconnecting Prisma...`);
    try {
      await prisma.$disconnect();
      logger.info('Prisma disconnected successfully');
      process.exit(0);
    } catch (err) {
      logger.error('Error during Prisma disconnect:', err);
      process.exit(1);
    }
  });
});

export default prisma;
