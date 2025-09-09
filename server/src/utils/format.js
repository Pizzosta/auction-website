import { parsePhoneNumberFromString } from 'libphonenumber-js';

// helper you pass to Joi
export const normalizeToE164 = (input) => {
  const phone = parsePhoneNumberFromString(input, 'GH'); // Ghana default
  return phone && phone.isValid() ? phone.format('E.164') : null;
};
