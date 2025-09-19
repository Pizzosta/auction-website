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