import IORedis from 'ioredis';
import { env } from '../config/env.js';
import logger from '../utils/logger.js';

class QueuePubSub {
    constructor() {
        const redisConfig = {
            host: env.redis?.host || '127.0.0.1',
            port: env.redis?.port || 6379,
            password: env.redis?.password,
            tls: env.redis?.tls ? {} : undefined,
            maxRetriesPerRequest: 3,
            commandTimeout: 5000,
            connectTimeout: 10000,
        };

        try {
            this.publisher = new IORedis(redisConfig);
            this.subscriber = new IORedis(redisConfig);

            this.setupEventHandlers();

            logger.info('QueuePubSub initialized', {
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            logger.error('Failed to initialize QueuePubSub', { error: error.message });
            throw error;
        }
    }

    setupEventHandlers() {
        const handlers = ['connect', 'ready', 'error', 'end', 'reconnecting'];

        handlers.forEach(event => {
            this.publisher.on(event, (...args) => {
                logger.debug(`Redis publisher ${event}`, { args: args[0]?.message || args[0] });
            });

            this.subscriber.on(event, (...args) => {
                logger.debug(`Redis subscriber ${event}`, { args: args[0]?.message || args[0] });
            });
        });
    }

    async publishQueueEvent(channel, event) {
        try {
            await this.publisher.publish(
                channel,
                JSON.stringify({
                    ...event,
                    timestamp: new Date().toISOString()
                })
            );
            logger.debug('Queue event published', { channel, eventId: event.jobId });
        } catch (error) {
            logger.error('Failed to publish queue event', { channel, error: error.message });
            throw error;
        }
    }

    // Optional: Subscribe to external events if needed
    async subscribe(channel, callback) {
        try {
            await this.subscriber.subscribe(channel);
            this.subscriber.on('message', (ch, message) => {
                if (ch === channel) {
                    try {
                        const parsed = JSON.parse(message);
                        callback(parsed);
                    } catch (parseError) {
                        logger.error('Failed to parse message', { channel, message, error: parseError.message });
                    }
                }
            });
            logger.info('Subscribed to channel', { channel });
        } catch (error) {
            logger.error('Failed to subscribe to channel', { channel, error: error.message });
            throw error;
        }
    }

    async close() {
        try {
            await this.publisher.quit();
            await this.subscriber.quit();
            logger.info('QueuePubSub connections closed');
        } catch (error) {
            logger.error('Error closing QueuePubSub', { error: error.message });
        }
    }
}

export const pubsub = new QueuePubSub();