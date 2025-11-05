import { Prisma } from '@prisma/client';
import logger from '../utils/logger.js';

/**
 * Custom error class for handling operational errors
 */
class AppError extends Error {
  constructor(code, message, statusCode, details = null, originalError = null) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.details = details;
    this.originalError = originalError;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Prisma-specific error handlers
 */
const handlePrismaError = err => {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002': {
        // Unique constraint failed
        const target = err.meta?.target?.join(', ') || 'field';
        return new AppError('DUPLICATE_VALUE', `Duplicate value for ${target}. Please use another value.`, 400, { target }, err);
      }
      case 'P2025':
        // Some P2025 cases may be optimistic concurrency (handled at controller level)
        return new AppError('RECORD_NOT_FOUND', 'Record not found', 404, null, err);
      case 'P2003':
        return new AppError('FOREIGN_KEY_CONSTRAINT', 'Foreign key constraint failed', 400, null, err);
      default:
        return new AppError('DATABASE_ERROR', `Database error: ${err.message}`, 400, null, err);
    }
  }
  if (err instanceof Prisma.PrismaClientValidationError) {
    return new AppError('VALIDATION_ERROR', `Invalid input: ${err.message}`, 400, null, err);
  }
  return err;
};

/**
 * JWT error handlers
 */
const handleJWTError = () => new AppError('JWT_ERROR', 'Invalid token. Please log in again!', 401);
const handleJWTExpiredError = () =>
  new AppError('JWT_EXPIRED', 'Your token has expired! Please log in again.', 401);

const handleValidationError = err => {
  const validationMessages = err.details?.map(d => d.message).join(', ') || err.message;
  return new AppError('VALIDATION_ERROR', validationMessages, 400, null, err);
};

/**
 * Global error handling middleware
 */
const globalErrorHandler = (err, req, res, _next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  // Normalize the error object
  let error = Object.create(err);
  Object.assign(error, err);

  // Prisma errors
  error = handlePrismaError(error);

  // JWT errors
  if (error.name === 'JsonWebTokenError') error = handleJWTError();
  if (error.name === 'TokenExpiredError') error = handleJWTExpiredError();

  // Validation errors
  if (error.name === 'ValidationError') error = handleValidationError(error);


  // Determine log level based on error type
  const logLevel = error.isOperational ? 'warn' : 'error';

  // Log structured error with request context
  logger[logLevel]('Unhandled error', {
    status: error.status,
    statusCode: error.statusCode,
    message: error.message,
    stack: error.stack,
    path: req.originalUrl,
    method: req.method,
    ip: req.ip,
    user: req.user?.id || 'guest',
    isOperational: error.isOperational,
    // Only include stack for non-operational errors in production
    ...(!error.isOperational && { stack: error.stack }),
    // Include original error object for debugging in development
    ...(process.env.NODE_ENV === 'development' && {
      stack: error.stack,
      originalError: {
        name: err.name,
        message: err.message,
        code: err.code,
        full: err,
      },
    }),
  });

  // Send response to client
  res.status(error.statusCode || 500).json({
    code: error.code || 'INTERNAL_SERVER_ERROR',
    status: error.status,
    message: error.message || 'Internal Server Error',
    ...(error.details && { details: error.details }),
    ...(process.env.NODE_ENV === 'development' && {
      originalError: error.originalError || error.stack,
    }),
  });

};

export { globalErrorHandler, AppError };
