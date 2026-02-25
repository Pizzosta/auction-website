import toast from 'react-hot-toast';

/**
 * Toast utility wrapper for consistent notifications across the app
 */
export const showToast = {
  /**
   * Show success notification
   * @param {string} message - The message to display
   * @param {object} options - Additional toast options
   */
  success: (message, options = {}) => {
    return toast.success(message, {
      duration: 3000,
      ...options,
    });
  },

  /**
   * Show error notification
   * @param {string} message - The message to display
   * @param {object} options - Additional toast options
   */
  error: (message, options = {}) => {
    return toast.error(message, {
      duration: 4000,
      ...options,
    });
  },

  /**
   * Show info/loading notification
   * @param {string} message - The message to display
   * @param {object} options - Additional toast options
   */
  loading: (message, options = {}) => {
    return toast.loading(message, {
      duration: Infinity,
      ...options,
    });
  },

  /**
   * Show generic toast notification
   * @param {string} message - The message to display
   * @param {object} options - Additional toast options
   */
  custom: (message, options = {}) => {
    return toast(message, {
      duration: 4000,
      ...options,
    });
  },

  /**
   * Dismiss a toast by its ID
   * @param {string} toastId - The ID of the toast to dismiss
   */
  dismiss: (toastId) => {
    toast.dismiss(toastId);
  },

  /**
   * Dismiss all toasts
   */
  dismissAll: () => {
    toast.dismiss();
  },
};

export default showToast;
