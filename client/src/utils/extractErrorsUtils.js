export const extractErrors = (errData) => {
  if (errData?.errors && typeof errData.errors === "object") {
    return errData.errors;
  }
  if (errData?.details && typeof errData.details === "object") {
    return errData.details;
  }
  return null;
};

export const focusFirstErrorField = (errors) => {
  const firstKey = Object.keys(errors)[0];
  const el = document.getElementById(firstKey);
  el?.focus();
};
