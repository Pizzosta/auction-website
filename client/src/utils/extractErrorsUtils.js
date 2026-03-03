export const extractErrors = (errData) => {
  if (errData?.errors && typeof errData.errors === "object") {
    return errData.errors;
  }
  if (errData?.details && typeof errData.details === "object") {
    return errData.details;
  }
  // Handle array format from some backends
  if (Array.isArray(errData?.message)) {
    return { general: errData.message.join(", ") };
  }
  return null;
};

export const focusFirstErrorField = (errors) => {
  const firstKey = Object.keys(errors)[0];
  if (!firstKey) return;

  // Special handling for phone input
  if (firstKey === 'phone') {
    const phoneInput = document.querySelector('.react-tel-input input');
    if (phoneInput) {
      phoneInput.scrollIntoView({ behavior: "smooth", block: "center" });
      phoneInput.focus({ preventScroll: true });
      return;
    }
  }

  // Try to find and focus the element
  const el = document.getElementById(firstKey) || 
             document.querySelector(`[name="${firstKey}"]`) ||
             document.querySelector(`input[id="${firstKey}"]`);

  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.focus({ preventScroll: true });
  }
};