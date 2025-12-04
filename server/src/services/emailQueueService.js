import Queue from 'bull';
import IORedis from 'ioredis';
import logger from '../utils/logger.js';
import { sendTemplateEmail } from './emailService.js';
import { env } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';
import { pubsub } from './queuePubSub.js';

let emailQueue = null;
let deadLetterQueue = null;
let monitoringInterval = null;

// Redis client factory (required by Bull with auth)
const createClient = (type) => {
    const opts = {
        host: env.redis?.host || '127.0.0.1',
        port: env.redis?.port || 6379,
        password: env.redis?.password || undefined,
        tls: env.redis?.tls ? {} : undefined,
        maxRetriesPerRequest: null,
        commandTimeout: 30000,
        connectTimeout: 15000,
        retryStrategy: times => Math.min(times * 500, 10000),
    };

    if (type === 'subscriber' || type === 'bclient') {
        opts.enableReadyCheck = false;
    }

    logger.info(`Creating ioredis client for Bull (${type})`, {
        host: opts.host,
        port: opts.port,
        auth: !!opts.password,
    });

    return new IORedis(opts);
};

export async function getEmailQueue() {
    if (emailQueue) return emailQueue;

    emailQueue = new Queue('emailQueue', {
        createClient,
        defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 500 },
            removeOnComplete: true,
            removeOnFail: false,
        },
    });

    // Initialize DLQ
    await initializeDeadLetterQueue();

    // Process emails
    emailQueue.process(async (job) => {
        const { type, to, context = {} } = job.data;
        const recipientEmail = typeof to === 'object' && to !== null && 'email' in to ? to.email : to;


        logger.info(`Processing email job ${job.id} → ${type} to ${recipientEmail}`);

        try {
            await sendTemplateEmail(type, recipientEmail, { ...context, ...(typeof to === 'object' ? to : {}) });
            logger.info(`Email sent: ${job.id}`);

            // Publish completed event
            pubsub.publishQueueEvent('email:completed', {
                jobId: job.id,
                type: job.data.type,
                recipient: job.data.to,
                duration: Date.now() - job.timestamp
            });
        } catch (error) {
            logger.error(`Email failed: ${job.id}`, { error: error.message });

            // Publish failed event
            pubsub.publishQueueEvent('email:failed', {
                jobId: job.id,
                type: job.data.type,
                recipient: job.data.to,
                error: error.message
            });
            throw error;
        }
    });

    // Event handlers
    emailQueue.on('waiting', (jobId) => {
        logger.debug(`Email job ${jobId} waiting`);
    });

    emailQueue.on('active', (job) => {
        pubsub.publishQueueEvent('email:started', {
            jobId: job.id,
            type: job.data.type,
            recipient: job.data.to,
            queueTime: Date.now() - job.timestamp
        });
    });

    // Move failed jobs to DLQ after max attempts
    emailQueue.on('failed', async (job, err) => {
        if (job.attemptsMade >= job.opts.attempts) {
            await moveToDeadLetterQueue(job, err);
        }
    });

    emailQueue.on('error', err => logger.error('Email queue error:', err));

    await emailQueue.isReady();
    logger.info('Email queue ready');

    // Start monitoring
    startQueueMonitoring();

    return emailQueue;
}

// DLQ
async function initializeDeadLetterQueue() {
    deadLetterQueue = new Queue('emailDeadLetterQueue', { createClient });
    await deadLetterQueue.isReady();
    logger.info('Dead letter queue initialized');
}

async function moveToDeadLetterQueue(job, error) {
    pubsub.publishQueueEvent('email:deadletter', {
        jobId: job.id,
        type: job.data.type,
        recipient: job.data.to,
        reason: error?.message,
        attempts: job.attemptsMade
    });

    if (!deadLetterQueue) {
        logger.error('DLQ not initialized when trying to move job', { jobId: job.id });
        return;
    }

    try {
        await deadLetterQueue.add({
            originalJob: job.data,
            originalId: job.id,
            failedAt: new Date().toISOString(),
            failureReason: error.message,
            stackTrace: error.stack,
            attemptsMade: job.attemptsMade,
        }, { jobId: `dlq-${job.id}-${Date.now()}` });

        await job.remove();
        logger.warn(`Job ${job.id} → DLQ`);
    } catch (err) {
        logger.error('Failed to move job to DLQ', { jobId: job.id, error: err.message });
    }
}

// Monitoring
function startQueueMonitoring() {
    monitoringInterval = setInterval(async () => {
        try {
            await monitorQueueHealth();
        } catch (err) {
            logger.error('Queue monitoring failed', err);
        }
    }, 5 * 60 * 1000);

    const shutdown = async () => {
        clearInterval(monitoringInterval);
        await logFinalQueueMetrics();
        process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
}

async function monitorQueueHealth() {
    if (!emailQueue) throw new AppError('EMAIL_QUEUE_NOT_INITIALISED', 'Email queue not initialised', 500);
    // Get main queue counts
    const [
        waiting, active, completed, failed, delayed, paused
    ] = await Promise.all([
        emailQueue.getWaitingCount(),
        emailQueue.getActiveCount(),
        emailQueue.getCompletedCount(),
        emailQueue.getFailedCount(),
        emailQueue.getDelayedCount(),
        emailQueue.getPausedCount()
    ]);
    // Get DLQ counts 
    const dlqCount = deadLetterQueue ? await deadLetterQueue.getJobCounts() : 0;

    const metrics = { waiting, active, completed, failed, delayed, paused, deadLetter: dlqCount };
    logger.info('Email queue metrics', metrics);

    // Publish metrics for external systems
    await pubsub.publishQueueEvent('email:metrics', metrics);

    // Alerts
    if (waiting > 1000 || dlqCount > 100) {
        logger.error('QUEUE ALERT: High backlog', metrics);
        await pubsub.publishQueueEvent('email:alert', {
            type: 'high_backlog',
            level: 'error',
            ...metrics
        });
    } else if (waiting > 500 || dlqCount > 50) {
        logger.warn('QUEUE ALERT: Moderate backlog', metrics);
        await pubsub.publishQueueEvent('email:alert', {
            type: 'moderate_backlog',
            level: 'warning',
            ...metrics
        });
    }

    return metrics;
}

async function logFinalQueueMetrics() {
    try {
        const metrics = await monitorQueueHealth();
        logger.info('Final queue metrics on shutdown', metrics);
    } catch (err) {
        logger.error('Failed final metrics', err);
    }
}

// Public API
export const addToQueue = async (type, to, context = {}) => {
    const queue = await getEmailQueue();
    const job = await queue.add({ type, to, context, timestamp: Date.now() });
    
    // Publish job added event
    await pubsub.publishQueueEvent('email:added', {
        jobId: job.id,
        type,
        recipient: typeof to === 'object' && to.email ? to.email : to
    });
    
    return job;
};

export async function getQueueMetrics() {
    return monitorQueueHealth();
}

export async function getDeadLetterJobs(skip = 0, limit = 50) {
    if (!deadLetterQueue) throw new AppError('DLQ_NOT_INITIALISED', 'DLQ not initialised', 500);
    const jobs = await deadLetterQueue.getJobs(['waiting', 'failed'], skip, skip + limit - 1);
    return jobs.map(j => ({
        id: j.id,
        data: j.data,
        timestamp: j.timestamp,
        failedReason: j.failedReason,
    }));
}

export async function retryDeadLetterJob(jobId) {
    if (!deadLetterQueue) throw new AppError('DLQ_NOT_INITIALISED', 'DLQ not initialised', 500);
    const job = await deadLetterQueue.getJob(jobId);
    if (!job) throw new AppError('DLQ_JOB_NOT_FOUND', 'Job not found', 404);

    const { originalJob } = job.data;
    const newJob = await addToQueue(originalJob.type, originalJob.to, originalJob.context);
    await job.remove();
    return newJob;
}

export async function deleteDeadLetterJob(jobId) {
    if (!deadLetterQueue) throw new AppError('DLQ_NOT_INITIALISED', 'DLQ not initialised', 500);
    const job = await deadLetterQueue.getJob(jobId);
    if (!job) throw new AppError('DLQ_JOB_NOT_FOUND', 'Job not found', 404);

    logger.info(`Deleting DLQ job ${jobId}`);
    await job.remove();
}

export async function closeQueues() {
    clearInterval(monitoringInterval);

    const queues = [emailQueue, deadLetterQueue].filter(Boolean);
    await Promise.all(queues.map(q => q.close()));

    emailQueue = null;
    deadLetterQueue = null;

    logger.info('Email queues closed');
}
