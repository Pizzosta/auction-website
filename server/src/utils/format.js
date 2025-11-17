import { parsePhoneNumberFromString } from 'libphonenumber-js';

// helper function to normalize phone numbers to E.164 format
export const normalizeToE164 = input => {
  const phone = parsePhoneNumberFromString(input, 'GH'); // Ghana default
  return phone && phone.isValid() ? phone.format('E.164') : null;
};

// helper function to format currency
export const formatCurrency = (amount) => {
  if (typeof amount !== "number") return amount;
  return amount.toLocaleString("en-GH", {
    style: "currency",
    currency: "GHS",
    minimumFractionDigits: 2,
  });
  //.replace("GH₵", "GH₵ ");
};

// helper function to format date and time
export const formatDateTime = (date) =>
  new Date(date).toLocaleString("en-GH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

// helper function to format time remaining
export const formatTimeRemaining = (endDate) => {
  const now = new Date();
  const end = new Date(endDate);
  const diffMs = end - now;

  if (diffMs <= 0) {
    return "Ended";
  }

  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (diffDays > 0) {
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ${diffHours} hour${diffHours !== 1 ? 's' : ''}`;
  } else if (diffHours > 0) {
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''}`;
  } else {
    return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''}`;
  }
};

// helper function to parse duration
export const parseDuration = (val, defaultMs = 10 * 60 * 1000) => {
  if (!val) return defaultMs;

  if (typeof val === 'number' && !isNaN(val)) {
    return val; // already in ms
  }

  const m = String(val).trim().match(/^(\d+)(ms|s|m|h|d)?$/i);
  if (!m) return defaultMs;

  const num = parseInt(m[1], 10);
  const unit = (m[2] || 'ms').toLowerCase();

  const multipliers = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return num * (multipliers[unit] || 1);
}

/**
 * Processes feedback objects (single or array) for display in the UI.
 * Handles making feedback anonymous if the sender is deleted or missing.
 * @param {object|object[]} feedback - Single feedback object or an array of objects.
 * @returns {object|object[]} The processed feedback data.
 */
export const processFeedbackForDisplay = (feedback) => {
  const ANONYMOUS_USER = {
    id: null,
    username: 'Anonymous',
    profilePicture: null
  };
  const DELETED_USER_SUFFIX = ' [User deleted]';

  const processedSingleFeedback = (item) => {
    if (!item) return item;

    // Check if fromUser is missing OR soft-deleted
    const isDeleted = item.fromUser?.isDeleted === true;
    const isMissing = !item.fromUser;

    if (isDeleted || isMissing) {
      return {
        ...item,
        isAnonymous: true, // Override regardless of original value
        fromUser: ANONYMOUS_USER,
        // Only modify comment if user was soft-deleted (not just missing)
        comment: isDeleted ? `${item.comment || ''}${DELETED_USER_SUFFIX}` : item.comment,
      };
    }
    
    return item; // Return unmodified if user exists
  };

  // Handle both arrays and single feedback objects
  if (Array.isArray(feedback)) {
    return feedback.map(processedSingleFeedback);
  }
  return processedSingleFeedback(feedback);
};

// Password strength checker
export const checkPasswordStrength = (password) => {
  const hasMinLength = password.length >= 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChar = /[^A-Za-z0-9]/.test(password);

  return {
    isValid: hasMinLength && hasUpperCase && hasLowerCase && hasNumbers && hasSpecialChar,
    issues: {
      minLength: !hasMinLength ? 'Must be at least 8 characters' : null,
      upperCase: !hasUpperCase ? 'Must contain at least one uppercase letter' : null,
      lowerCase: !hasLowerCase ? 'Must contain at least one lowercase letter' : null,
      numbers: !hasNumbers ? 'Must contain at least one number' : null,
      specialChar: !hasSpecialChar ? 'Must contain at least one special character' : null,
    },
  };
};
