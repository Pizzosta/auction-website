import {
  addToQueue,
  getQueueMetrics,
  getDeadLetterJobs,
  retryDeadLetterJob,
  deleteDeadLetterJob,
  getEmailQueue,
} from '../services/emailQueueService.js';
import { AppError } from '../middleware/errorHandler.js';

export const queueEmail = async (req, res, next) => {
  try {
    const { type, to, context } = req.body;
    if (!type || !to) {
      throw new AppError('EMAIL_QUEUE_FAILED', 'Missing type or to', 400);
    }
    const job = await addToQueue(type, to, context);
    return res.status(201).json({
      status: 'success',
      jobId: job.id,
      queue: 'emailQueue',
    });
  } catch (error) {
    next(error);
  }
};

export const getMetrics = async (req, res, next) => {
  try {
    const metrics = await getQueueMetrics();
    return res.json({ status: 'success', metrics });
  } catch (error) {
    next(error);
  }
};

export const listDeadLetter = async (req, res, next) => {
  try {
    const skip = parseInt(req.query.skip) || 0;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const jobs = await getDeadLetterJobs(skip, limit);
    return res.json({ status: 'success', jobs });
  } catch (error) {
    next(error);
  }
};

export const retryJob = async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const newJob = await retryDeadLetterJob(jobId);
    return res.json({ status: 'success', newJobId: newJob.id });
  } catch (error) {
    next(error);
  }
};

export const deleteJob = async (req, res, next) => {
  try {
    const { jobId } = req.params;
    await deleteDeadLetterJob(jobId);
    return res.json({ status: 'success', jobId });
  } catch (error) {
    next(error);
  }
};

export const pauseQueue = async (req, res, next) => {
  try {
    const queue = await getEmailQueue();
    await queue.pause();
    return res.json({ status: 'success', message: 'Queue paused' });
  } catch (error) {
    next(error);
  }
};

export const resumeQueue = async (req, res, next) => {
  try {
    const queue = await getEmailQueue();
    await queue.resume();
    return res.json({ status: 'success', message: 'Queue resumed' });
  } catch (error) {
    next(error);
  }
};