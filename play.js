import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger.js';

// Log levels: 'query', 'info', 'warn', 'error'
const logLevels = ['error', 'warn'];

// Add 'query' logging in development
if (process.env.NODE_ENV !== 'production') {
  logLevels.push('query');
}

// Add 'info' logging if debug mode is enabled
if (process.env.DEBUG === 'true') {
  logLevels.push('info');
}

const prismaClientOptions = {
  log: logLevels.map(level => ({
    emit: 'event',
    level,
  })),
  errorFormat: 'pretty',
};

let prisma;

// Ensure we reuse a single PrismaClient in dev (hot-reload friendly)
if (process.env.NODE_ENV !== 'production') {
  if (!global.__PRISMA_CLIENT__) {
    global.__PRISMA_CLIENT__ = new PrismaClient(prismaClientOptions);
    setupPrismaLogging(global.__PRISMA_CLIENT__);
  }
  prisma = global.__PRISMA_CLIENT__;
} else {
  prisma = new PrismaClient(prismaClientOptions);
  setupPrismaLogging(prisma);
}

/**
 * Sets up logging for Prisma client events
 * @param {PrismaClient} client - The Prisma client instance
 */
function setupPrismaLogging(client) {
  // Query logging
  client.$on('query', (e) => {
    logger.debug('Prisma Query', {
      query: e.query,
      params: e.params,
      duration: e.duration,
      timestamp: e.timestamp,
    });
  });

  // Info logging
  client.$on('info', (e) => {
    logger.info(`Prisma Info: ${e.message}`, {
      timestamp: e.timestamp,
      target: e.target,
    });
  });

  // Warning logging
  client.$on('warn', (e) => {
    logger.warn(`Prisma Warning: ${e.message}`, {
      timestamp: e.timestamp,
      target: e.target,
    });
  });

  // Error logging
  client.$on('error', (e) => {
    logger.error(`Prisma Error: ${e.message}`, {
      timestamp: e.timestamp,
      target: e.target,
    });
  });

  // Log when Prisma connects and disconnects
  client.$on('beforeExit', () => {
    logger.info('Prisma client is disconnecting...');  });

  process.on('beforeExit', async () => {
    logger.info('Closing Prisma client...');
    await client.$disconnect();
    logger.info('Prisma client disconnected');
  });
}

export default prisma;
