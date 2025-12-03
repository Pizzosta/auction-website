import { Prisma } from '@prisma/client';
import logger from '../utils/logger.js';
import { env, validateEnv } from '../config/env.js';

// Validate required environment variables
const missingVars = validateEnv();
if (missingVars.length > 0) {
  logger.error(`Missing required environment variables: ${missingVars.join(', ')}`);
  process.exit(1);
}

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

const handleGenericError = (err) => {
  // Extract meaningful information from common error types
  let details = null;
  
  if (err.name === 'TypeError') {
    const match = err.message.match(/(\w+)\.(\w+) is not a function/);
    if (match) {
      details = {
        objectType: match[1],
        missingMethod: match[2],
        suggestion: `Check if ${match[1]} is properly initialized or if ${match[2]} method exists`
      };
    } else if (err.message.includes('Cannot read properties')) {
      const match = err.message.match(/Cannot read properties of (null|undefined) \(reading '(\w+)'\)/);
      if (match) {
        details = {
          issue: 'null_or_undefined_access',
          property: match[2],
          suggestion: 'Check variable initialization before accessing properties'
        };
      }
    }
  }
  
  if (err.name === 'ReferenceError') {
    const match = err.message.match(/(\w+) is not defined/);
    if (match) {
      details = {
        undefinedVariable: match[1],
        suggestion: `Check if ${match[1]} is imported/declared properly`
      };
    }
  }
  
  return new AppError(
    err.name?.toUpperCase().replace(/\s+/g, '_') || 'UNKNOWN_ERROR',
    err.message || 'An unexpected error occurred',
    500,
    details,
    err
  );
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

  // Handle generic errors (like TypeError, ReferenceError, etc.)
  if (!error.isOperational && error instanceof Error) {
    error = handleGenericError(error);
  }

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
    // Always include stack for errors in development
    ...(env.isDev && {
      stack: error.stack,
      // Include original error if available
      ...(error.originalError && {
        originalError: {
          name: error.originalError.name,
          message: error.originalError.message,
          stack: error.originalError.stack
        }
      }),
      // Include details if available
      ...(error.details && { details: error.details })
    }),
    // For production, include minimal stack info for non-operational errors
    ...(!env.isDev && !error.isOperational && {
      stack: error.stack?.split('\n')[0] // Just first line in production
    })
  });

  // Send response to client
  // Build response object
  const response = {
    code: error.code || 'INTERNAL_SERVER_ERROR',
    status: error.status,
    message: error.message || 'Internal Server Error',
    // Always include details if available
    ...(error.details && { details: error.details })
  };

  // Enhanced development response
  if (env.isDev) {
    response.debug = {
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
      method: req.method
    };
    
    // Include original error info if available
    if (error.originalError) {
      response.debug.originalError = {
        name: error.originalError.name,
        message: error.originalError.message,
        // Only include first few lines of stack in response
        stack: error.originalError.stack?.split('\n').slice(0, 5)
      };
    }
    
    // Include the error stack
    response.debug.stack = error.stack?.split('\n').slice(0, 10);
  }

  // Send response
  res.status(error.statusCode).json(response);
};

export { globalErrorHandler, AppError };
