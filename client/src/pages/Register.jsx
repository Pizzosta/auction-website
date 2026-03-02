import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import parsePhoneNumberFromString from "libphonenumber-js";
import Spinner from "../components/Spinner";
import { handleApiError, handleError } from "../utils/errorHandler";
import PhoneInput from "react-phone-input-2";
import "react-phone-input-2/lib/style.css";
import { showToast } from "../utils/toast";

function RegisterPage() {
  const [firstname, setFirstname] = useState("");
  const [middlename, setMiddlename] = useState("");
  const [lastname, setLastname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const errorRef = useRef(null);
  const formRef = useRef(null);
  const navigate = useNavigate();

  // Calculate password strength and feedback
  useEffect(() => {
    let strength = 0;
    if (password.length >= 8) strength += 1;
    if (password.match(/[a-z]+/)) strength += 1;
    if (password.match(/[A-Z]+/)) strength += 1;
    if (password.match(/[0-9]+/)) strength += 1;
    if (password.match(/[!@#$%^&*(),.?":{}|<>]+/)) strength += 1;
    setPasswordStrength(strength);
  }, [password]);

  const getPasswordStrengthColor = () => {
    if (password.length === 0) return "bg-gray-200 dark:bg-gray-700";
    if (passwordStrength <= 1) return "bg-red-500";
    if (passwordStrength <= 3) return "bg-yellow-500";
    return "bg-green-500";
  };

  const getPasswordStrengthText = () => {
    if (password.length === 0) return "";
    if (passwordStrength <= 1) return "Weak";
    if (passwordStrength <= 3) return "Good";
    return "Strong";
  };

  const getPasswordFeedback = () => {
    const feedback = [];
    if (password.length < 8) feedback.push("At least 8 characters");
    if (!password.match(/[a-z]+/)) feedback.push("Include lowercase letters");
    if (!password.match(/[A-Z]+/)) feedback.push("Include uppercase letters");
    if (!password.match(/[0-9]+/)) feedback.push("Include numbers");
    if (!password.match(/[!@#$%^&*(),.?":{}|<>]+/))
      feedback.push("Include special characters");
    return feedback;
  };

  //useEffect to clear field errors when inputs change
  useEffect(() => {
    setFieldErrors({});
  }, [
    firstname,
    middlename,
    lastname,
    username,
    email,
    phone,
    password,
    confirmPassword,
  ]);

  // Scroll into view when an error appears
  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      errorRef.current.focus({ preventScroll: true });
    }
  }, [error]);

  const validateFields = useCallback(() => {
    const errs = {};

    // Required field validation
    if (!firstname.trim()) errs.firstname = "First name is required";
    if (!lastname.trim()) errs.lastname = "Last name is required";
    if (!username.trim()) errs.username = "Username is required";

    // Email validation
    if (!email) {
      errs.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errs.email = "Please enter a valid email address";
    }

    // Phone validation
    if (!phone) {
      errs.phone = "Phone number is required";
    } else {
      try {
        //Normalize input: Remove spaces, dashes, and ensure exactly one leading '+'
        let normalized = phone.trim().replace(/[\s-]/g, "");

        // Remove multiple '+' signs and ensure single leading '+'
        normalized = normalized.replace(/^\+*/, "").replace(/\+/g, "");
        normalized = `+${normalized}`;
        const phoneNumber = parsePhoneNumberFromString(normalized, "GH");

        if (!phoneNumber?.isValid()) {
          errs.phone = "Please enter a valid phone number";
        } else if (!phoneNumber.country || phoneNumber.country !== "GH") {
          errs.phone = "Only Ghanaian (+233) numbers are currently supported";
        }
      } catch (error) {
        errs.phone = "Please enter a valid phone number";
      }
    }

    // Password validation
    if (!password) {
      errs.password = "Password is required";
    } else if (password.length < 8) {
      errs.password = "Password must be at least 8 characters";
    } else if (
      !/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\da-zA-Z])/.test(password)
    ) {
      errs.password =
        "Password must include uppercase, lowercase, number, and special character";
    }

    // Confirm password
    if (password && !confirmPassword) {
      errs.confirmPassword = "Please confirm your password";
    } else if (password !== confirmPassword) {
      errs.confirmPassword = "Passwords do not match";
    }

    // Terms acceptance
    if (!acceptedTerms) {
      errs.terms = "You must accept the terms and conditions";
    }

    return errs;
  }, [
    firstname,
    middlename,
    lastname,
    username,
    email,
    phone,
    password,
    confirmPassword,
    acceptedTerms,
  ]);

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      setError("");
      setFieldErrors({});

      // Client-side validation
      const validationErrors = validateFields();
      if (Object.keys(validationErrors).length > 0) {
        setFieldErrors(validationErrors);

        // Focus on first error field
        const firstErrorField = Object.keys(validationErrors)[0];
        const element = document.querySelector(`[name="${firstErrorField}"]`);
        if (element) {
          element.focus();
        }

        // Show the first error in toast
        showToast.error(validationErrors[firstErrorField]);

        return;
      }

      setIsLoading(true);

      try {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            firstname,
            middlename,
            lastname,
            username,
            email,
            phone,
            password,
            confirmPassword,
          }),
        });
        const data = await res.json();
        /*if (!res.ok) {
          const error = handleApiError(data);
          handleError(error, setError);
          return;
        }*/
        if (!res.ok) {
          // If the server returned the "errors" array from your logs
          if (data.errors && Array.isArray(data.errors)) {
            // Join the errors into a single string for the main error alert
            const combinedMessage = data.errors.join(". ");
            setError(combinedMessage);
            showToast.error(data.errors[0]); // Show the first one in toast

            // Optional: If you want to highlight specific fields, you'd need the server
            // to return an object like { firstname: "Too short" } instead of an array.
          } else {
            const error = handleApiError(data);
            handleError(error, setError);
          }
          return;
        }

        // Show success message
        showToast.success("Registration successful!");

        // Redirect to HomePage with success state
        navigate("/login");
      } catch (error) {
        console.error("Registration error:", error);

        // Set default error message
        let errorMessage =
          error.message || "Registration failed. Please try again.";

        // Update field errors if available
        if (error.details) {
          setFieldErrors(error.details);
          // Show the first field error in toast
          const firstError = Object.values(error.details)[0];
          if (firstError) {
            errorMessage = firstError;
          }
        }

        // Set the error message
        setError(errorMessage);

        // Show error toast
        showToast.error(errorMessage);

        // Focus on error message for screen readers
        setTimeout(() => errorRef.current?.focus(), 100);
      } finally {
        setIsLoading(false);
      }
    },
    [
      validateFields,
      phone,
      firstname,
      middlename,
      lastname,
      email,
      password,
      confirmPassword,
      username,
      navigate,
    ],
  );

  const renderHeader = () => (
    <div className="text-center mb-8">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
        Create Your Account
      </h1>
      <p className="text-gray-600 dark:text-gray-300">
        Join our community of bidders and sellers
      </p>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl">
          {renderHeader()}

          <form
            ref={formRef}
            onSubmit={handleSubmit}
            className="space-y-4"
            noValidate
          >
            {/* Error messages */}
            <div
              ref={errorRef}
              tabIndex={-1}
              aria-live="assertive"
              className="sr-only"
            >
              {error}
              {Object.values(fieldErrors).join(" ")}
            </div>
            {error && (
              <div
                className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-4 rounded flex items-start"
                role="alert"
                aria-live="assertive"
                tabIndex={-1}
                ref={errorRef}
              >
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg
                      className="h-5 w-5 text-red-500"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-red-700 dark:text-red-300">
                      {error}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div>
              <label
                className="block mb-1 font-semibold text-gray-900 dark:text-gray-100"
                htmlFor="firstname"
              >
                First Name
              </label>
              <input
                id="firstname"
                type="text"
                value={firstname}
                onChange={(e) => setFirstname(e.target.value)}
                className={`border rounded w-full p-2 mb-1 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 ${
                  fieldErrors.firstname
                    ? "border-red-500 dark:border-red-400"
                    : ""
                }`}
                required
                aria-label="First name"
                autoComplete="given-name"
                aria-describedby={
                  fieldErrors.firstname ? "firstname-error" : undefined
                }
              />
              {fieldErrors.firstname && (
                <span
                  id="firstname-error"
                  className="text-red-500 dark:text-red-400 text-sm"
                >
                  {fieldErrors.firstname}
                </span>
              )}
            </div>
            <div>
              <label
                className="block mb-1 font-semibold text-gray-900 dark:text-gray-100"
                htmlFor="middlename"
              >
                Middle Name
              </label>
              <input
                id="middlename"
                type="text"
                value={middlename}
                onChange={(e) => setMiddlename(e.target.value)}
                className={`border rounded w-full p-2 mb-1 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 ${
                  fieldErrors.middlename
                    ? "border-red-500 dark:border-red-400"
                    : ""
                }`}
                aria-label="Middle name"
                autoComplete="additional-name"
                aria-describedby={
                  fieldErrors.middlename ? "middlename-error" : undefined
                }
              />
              {fieldErrors.middlename && (
                <span
                  id="middlename-error"
                  className="text-red-500 dark:text-red-400 text-sm"
                >
                  {fieldErrors.middlename}
                </span>
              )}
            </div>
            <div>
              <label
                className="block mb-1 font-semibold text-gray-900 dark:text-gray-100"
                htmlFor="lastname"
              >
                Last Name
              </label>
              <input
                id="lastname"
                type="text"
                value={lastname}
                onChange={(e) => setLastname(e.target.value)}
                className={`border rounded w-full p-2 mb-1 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 ${
                  fieldErrors.lastname
                    ? "border-red-500 dark:border-red-400"
                    : ""
                }`}
                required
                aria-label="Last name"
                autoComplete="family-name"
                aria-describedby={
                  fieldErrors.lastname ? "lastname-error" : undefined
                }
              />
              {fieldErrors.lastname && (
                <span
                  id="lastname-error"
                  className="text-red-500 dark:text-red-400 text-sm"
                >
                  {fieldErrors.lastname}
                </span>
              )}
            </div>
            <div>
              <label
                className="block mb-1 font-semibold text-gray-900 dark:text-gray-100"
                htmlFor="username"
              >
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={`border rounded w-full p-2 mb-1 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 ${
                  fieldErrors.username
                    ? "border-red-500 dark:border-red-400"
                    : ""
                }`}
                required
                aria-label="Username"
                autoComplete="username"
                aria-describedby={
                  fieldErrors.username ? "username-error" : undefined
                }
              />
              {fieldErrors.username && (
                <span
                  id="username-error"
                  className="text-red-500 dark:text-red-400 text-sm"
                >
                  {fieldErrors.username}
                </span>
              )}
            </div>
            <div>
              <label
                className="block mb-1 font-semibold text-gray-900 dark:text-gray-100"
                htmlFor="email"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`border rounded w-full p-2 mb-1 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 ${
                  fieldErrors.email ? "border-red-500 dark:border-red-400" : ""
                }`}
                required
                aria-label="Email"
                autoComplete="email"
                aria-describedby={fieldErrors.email ? "email-error" : undefined}
              />
              {fieldErrors.email && (
                <span
                  id="email-error"
                  className="text-red-500 dark:text-red-400 text-sm"
                >
                  {fieldErrors.email}
                </span>
              )}
            </div>
            <div>
              <label
                className="block mb-1 font-semibold text-gray-900 dark:text-gray-100"
                htmlFor="phone"
              >
                Phone
              </label>
              <PhoneInput
                country={"gh"}
                value={phone}
                name="phone"
                onChange={(value) => {
                  const formattedValue = value.startsWith("2330")
                    ? "233" + value.slice(4)
                    : value;
                  setPhone(formattedValue);
                }}
                disableDropdown={true} // User cannot change the country
                countryCodeEditable={false} // User cannot delete or edit +233
                onlyCountries={["gh"]} // Restrict internal list to Ghana only
                masks={{ gh: "........." }}
                inputProps={{
                  id: "phone",
                  required: true,
                  "aria-label": "Phone number",
                  "aria-describedby": fieldErrors.phone
                    ? "phone-error"
                    : undefined,
                  className: `flex-1 block border rounded w-full p-2 mb-1 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 ${
                    fieldErrors.phone
                      ? "border-red-500 dark:border-red-400"
                      : "border-gray-300 dark:border-gray-600"
                  } focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm pl-12`,
                }}
                inputStyle={{
                  width: "100%",
                  height: "45px",
                  fontSize: "1rem",
                }}
                buttonStyle={{
                  borderTop: fieldErrors.phone
                    ? "2px solid #f87171"
                    : "1px solid #d1d5db",
                  borderBottom: fieldErrors.phone
                    ? "2px solid #f87171"
                    : "1px solid #d1d5db",
                  borderLeft: fieldErrors.phone
                    ? "2px solid #f87171"
                    : "1px solid #d1d5db",
                  borderRight: "none",
                  backgroundColor: "rgb(249 250 251 / var(--tw-bg-opacity))",
                  "--tw-bg-opacity": "1",
                  height: "44px",
                }}
                dropdownStyle={{
                  backgroundColor: "rgb(31 41 55 / var(--tw-bg-opacity))",
                  "--tw-bg-opacity": "1",
                }}
                containerStyle={{
                  "--tw-bg-opacity": "1",
                }}
              />{" "}
              {fieldErrors.phone && (
                <span
                  id="phone-error"
                  className="text-red-500 dark:text-red-400 text-sm"
                >
                  {fieldErrors.phone}
                </span>
              )}
            </div>
            <div>
              <label
                className="block mb-1 font-semibold text-gray-900 dark:text-gray-100"
                htmlFor="password"
              >
                Password
              </label>
              <div className="relative flex items-center">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`border rounded w-full p-2 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 pr-10 ${
                    fieldErrors.password
                      ? "border-red-500 dark:border-red-400"
                      : ""
                  }`}
                  required
                  aria-label="Password"
                  autoComplete="new-password"
                  aria-describedby={
                    fieldErrors.password ? "password-error" : undefined
                  }
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 p-3 flex items-center justify-center text-gray-600 dark:text-gray-300"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg
                      className="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.418 0-8-3.582-8-8s3.582-8 8-8 8 3.582 8 8c0 1.02-.19 1.994-.525 2.91m-3.15 3.15L21 21"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 3l18 18"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542-7c-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                  )}
                </button>
              </div>
              {fieldErrors.password && (
                <span
                  id="password-error"
                  className="text-red-500 dark:text-red-400 text-sm"
                >
                  {fieldErrors.password}
                </span>
              )}
              <div className="mt-2">
                <div className="h-1 w-full bg-gray-200 dark:bg-gray-700 rounded">
                  <div
                    className={`h-1 rounded ${getPasswordStrengthColor()}`}
                    style={{ width: `${(passwordStrength / 5) * 100}%` }}
                  ></div>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Password strength: {getPasswordStrengthText()}
                </p>
                {password.length > 0 && (
                  <ul className="text-sm text-gray-600 dark:text-gray-400 mt-2 space-y-1">
                    {getPasswordFeedback().map((item, index) => (
                      <li key={index} className="flex items-center">
                        <svg
                          className="w-4 h-4 mr-2 text-red-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div>
              <label
                className="block mb-1 font-semibold text-gray-900 dark:text-gray-100"
                htmlFor="confirmPassword"
              >
                Confirm Password
              </label>
              <div className="relative flex items-center">
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`border rounded w-full p-2 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 pr-10 ${
                    fieldErrors.confirmPassword
                      ? "border-red-500 dark:border-red-400"
                      : ""
                  }`}
                  required
                  aria-label="Confirm password"
                  autoComplete="new-password"
                  aria-describedby={
                    fieldErrors.confirmPassword
                      ? "confirmPassword-error"
                      : undefined
                  }
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute inset-y-0 right-0 p-3 flex items-center justify-center text-gray-600 dark:text-gray-300"
                  aria-label={
                    showConfirmPassword
                      ? "Hide confirm password"
                      : "Show confirm password"
                  }
                >
                  {showConfirmPassword ? (
                    <svg
                      className="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.418 0-8-3.582-8-8s3.582-8 8-8 8 3.582 8 8c0 1.02-.19 1.994-.525 2.91m-3.15 3.15L21 21"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 3l18 18"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542-7c-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                  )}
                </button>
              </div>
              {fieldErrors.confirmPassword && (
                <span
                  id="confirmPassword-error"
                  className="text-red-500 dark:text-red-400 text-sm"
                >
                  {fieldErrors.confirmPassword}
                </span>
              )}
            </div>
            <div className="pt-4">
              <div className="flex items-center mb-4">
                <input
                  id="terms"
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  required
                />
                <label
                  htmlFor="terms"
                  className="ml-2 block text-sm text-gray-700 dark:text-gray-300"
                >
                  I agree to the{" "}
                  <Link
                    to="/terms"
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link
                    to="/privacy"
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Privacy Policy
                  </Link>
                </label>
              </div>
              {fieldErrors.terms && (
                <span
                  id="terms-error"
                  className="text-red-500 dark:text-red-400 text-sm"
                >
                  {fieldErrors.terms}
                </span>
              )}
              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-6 rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-70 disabled:cursor-not-allowed"
                disabled={isLoading || !acceptedTerms}
              >
                {isLoading ? (
                  <>
                    <Spinner size="sm" color="white" className="mr-2" />
                    Creating account...
                  </>
                ) : (
                  "Create Account"
                )}
              </button>
            </div>
          </form>
          <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
            Already have an account?{" "}
            <Link
              to="/login"
              className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default RegisterPage;
