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
