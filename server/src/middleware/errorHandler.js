import logger from '../utils/logger.js';

/**
 * Custom error class for handling operational errors
 */
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error handlers for specific error types
 */
const handleCastErrorDB = err => {
  const message = `Invalid ${err.path}: ${err.value}`;
  return new AppError(message, 400);
};

const handleDuplicateFieldsDB = err => {
  // Extract the duplicate field key and value
  const fieldName = Object.keys(err.keyPattern || {})[0] || 'field';
  const fieldValue = err.keyValue ? err.keyValue[fieldName] : 'unknown';

  let message;
  switch (fieldName) {
    case 'email':
      message = 'An account with this email already exists.';
      break;
    case 'username':
      message = 'This username is already taken.';
      break;
    case 'phone':
      message = 'This phone number is already registered.';
      break;
    default:
      message = `Duplicate value for ${fieldName}: "${fieldValue}". Please use another value!`;
  }

  return new AppError(message, 400);
};

const handleValidationErrorDB = err => {
  const errors = Object.values(err.errors).map(el => el.message);
  const message = `Invalid input data. ${errors.join('. ')}`;
  return new AppError(message, 400);
};

const handleJWTError = () => new AppError('Invalid token. Please log in again!', 401);

const handleJWTExpiredError = () =>
  new AppError('Your token has expired! Please log in again.', 401);

/**
 * Global error handling middleware
 */
const globalErrorHandler = (err, req, res, _next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  // Normalize the error object
  let error = { ...err };
  error.message = err.message;
  error.stack = err.stack;

  // Handle specific error types
  if (error.name === 'CastError') error = handleCastErrorDB(error);
  if (error.code === 11000) error = handleDuplicateFieldsDB(error);
  if (error.name === 'ValidationError') error = handleValidationErrorDB(error);
  if (error.name === 'JsonWebTokenError') error = handleJWTError();
  if (error.name === 'TokenExpiredError') error = handleJWTExpiredError();

  // Determine log level based on error type
  const logLevel = error.isOperational ? 'warn' : 'error';

  // Log structured error with request context
  logger.error[logLevel]('Unhandled error', {
    status: error.status,
    statusCode: error.statusCode,
    message: error.message,
    stack: error.stack,
    path: req.originalUrl,
    method: req.method,
    ip: req.ip,
    isOperational: error.isOperational,
    // Only include stack for non-operational errors in production
    ...(!error.isOperational && { stack: error.stack }),
    // Include original error object for debugging in development
    ...(
      process.env.NODE_ENV === 'development'
      && {
        stack: error.stack,
        originalError: {
          name: err.name,
          message: err.message,
          code: err.code,
          full: err
        }
      })
  });

  // Send response to client
  res.status(error.statusCode || 500).json({
    status: error.status,
    message: error.message || 'Something went wrong!',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
  });
};

export { globalErrorHandler, AppError };
