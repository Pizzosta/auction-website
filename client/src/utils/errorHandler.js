export class AppError extends Error {
  constructor(message, statusCode, details = null) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const handleApiError = (error) => {
  if (error.response) {

    const { status, data } = error.response;
    const message = data?.message;
    const details = data?.details || null;
    return new AppError(message, status, details);
  } else if (error.request) {
    // The request was made but no response was received
    return new AppError(
      "No response from server. Please check your internet connection.",
      0,
    );
  } else {
    // Something happened in setting up the request that triggered an Error
    return new AppError(error.message || "An unexpected error occurred", 0);
  }
};

export const handleError = (error, setError = null) => {
  console.error("Error:", error);

  const errorMessage =
    error.response?.data?.message ||
    error.message ||
    "An unexpected error occurred. Please try again.";

  if (setError) {
    setError(errorMessage);
  }

  // You can add more sophisticated error handling here, like:
  // - Logging to an error tracking service
  // - Showing a toast notification
  // - Redirecting based on error type

  return errorMessage;
};
