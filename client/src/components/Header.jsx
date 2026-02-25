import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import ThemeToggle from "./ThemeToggle";
import { showToast } from "../utils/toast";
import { getAvatarUrl } from "../utils/avatarUtils";

function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [avatarError, setAvatarError] = useState({});
  const dropdownRef = useRef(null);
  const menuRef = useRef(null);

  // Close menu when clicking outside
  const handleClickOutside = useCallback((event) => {
    // Don't close if clicking on the menu button or the menu itself
    if (
      dropdownRef.current &&
      !dropdownRef.current.contains(event.target) &&
      menuRef.current &&
      !menuRef.current.contains(event.target)
    ) {
      setIsMenuOpen(false);
    }
  }, []);

  // Add and remove event listener for clicks outside
  useEffect(() => {
    if (isMenuOpen) {
      // Use a small timeout to prevent immediate closing when opening the menu
      const timer = setTimeout(() => {
        document.addEventListener("click", handleClickOutside, true);
      }, 0);

      return () => {
        clearTimeout(timer);
        document.removeEventListener("click", handleClickOutside, true);
      };
    }
  }, [isMenuOpen, handleClickOutside]);

  // Toggle menu
  const toggleMenu = useCallback((e) => {
    if (e) {
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
    }
    setIsMenuOpen((prev) => !prev);
  }, []);

  // Close menu
  const closeMenu = useCallback(() => {
    setIsMenuOpen(false);
  }, []);

  // Handle avatar image errors
  const handleAvatarError = useCallback(
    (userId) => () => {
      console.warn(`Failed to load avatar for user ${userId}`);
      setAvatarError((prev) => ({ ...prev, [userId]: true }));
    },
    [],
  );

  // Handle logout
  const handleLogout = useCallback(
    async (e) => {
      if (e) e.stopPropagation(); // Prevent event from bubbling up
      setIsLoggingOut(true);
      try {
        await logout();
        closeMenu();
        showToast.success("Logged out successfully!");
        navigate("/login");
      } catch (error) {
        console.error("Logout error:", error);
        showToast.error("Logout failed. Please try again.");
      } finally {
        setIsLoggingOut(false);
      }
    },
    [logout, closeMenu, navigate],
  );

  return (
    <header
      className="sticky top-0 z-50 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-md"
      role="banner"
      aria-label="Main header"
    >
      <nav
        className="container mx-auto flex justify-between items-center py-4 px-6"
        role="navigation"
        aria-label="Main navigation"
      >
        <div className="flex items-center space-x-3">
          <div className="relative">
            <Link to="/" aria-label="Home">
              <img
                src="/react.svg"
                className="w-12 h-12 transition-transform hover:scale-105"
                alt="Kawodze Auctions Logo"
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = "/react.svg";
                }}
              />
            </Link>
          </div>
          <div>
            <Link
              to="/"
              aria-label="Kawodze Auctions Home"
              className="hover:text-blue-200 dark:hover:text-blue-300 transition-colors"
            >
              <span className="text-2xl font-bold">Kawodze</span>
              <span className="text-sm font-medium block -mt-1 opacity-90">
                Auctions
              </span>
            </Link>
          </div>
        </div>

        {/* Mobile menu button (hidden on desktop) */}
        <div className="flex items-center gap-4">
          {/* Only show on mobile */}
          <button
            className="md:hidden p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-white"
            onClick={toggleMenu}
            aria-label="Toggle menu"
            aria-expanded={isMenuOpen}
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              {isMenuOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>
        </div>

        {/* Desktop Navigation */}
        <ul className="hidden md:flex items-center space-x-4" role="menubar">
          <NavItems user={user} />

          {/* Profile dropdown */}
          {user && (
            <li ref={dropdownRef} role="menuitem" className="relative group">
              <button
                className="flex items-center focus:outline-none"
                aria-label="User menu"
                aria-haspopup="true"
                onClick={toggleMenu}
              >
                <img
                  src={getAvatarUrl(user)}
                  alt={`${user.username}'s profile`}
                  className="w-9 h-9 rounded-full object-cover border-2 border-white dark:border-gray-200"
                  onError={handleAvatarError(user.id)}
                  loading="lazy"
                />
                <p className="font-semibold text-gray-900 dark:text-gray-100">
                  {user.username}
                </p>
                <svg
                  className="ml-1 w-4 h-4 transition-transform"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                  style={{
                    transform: isMenuOpen ? "rotate(180deg)" : "rotate(0deg)",
                  }}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {/* Dropdown menu */}
              <DropdownMenu
                isOpen={isMenuOpen}
                onClose={closeMenu}
                onLogout={handleLogout}
                user={user}
                isLoggingOut={isLoggingOut}
              />
            </li>
          )}

          {/* Enhanced Theme Toggle in Desktop */}
          <li className="hidden md:block">
            <div className="ml-4">
              <ThemeToggle />
            </div>
          </li>
        </ul>

        {/* Enhanced Mobile Navigation */}
        {isMenuOpen && (
          <>
            {/* Backdrop */}
            <div
              className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-40"
              onClick={closeMenu}
            />

            {/* Slide-in Menu */}
            <div className="md:hidden fixed top-0 right-0 h-full w-80 bg-white dark:bg-gray-800 shadow-xl z-50 transform transition-transform duration-300">
              <div className="flex flex-col h-full">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-600">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Menu
                  </h2>
                  <button
                    onClick={closeMenu}
                    className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
                    aria-label="Close menu"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                </div>

                {/* User Info (if logged in) */}
                {user && (
                  <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-700 dark:to-gray-600">
                    <div className="flex items-center space-x-3">
                      <img
                        src={getAvatarUrl(user)}
                        alt={`${user.username || "User"}'s profile`}
                        className="w-9 h-9 rounded-full object-cover border-2 border-white dark:border-gray-200"
                        onError={handleAvatarError(user.id)}
                        loading="lazy"
                      />
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-gray-100">
                          {user.username}
                        </p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {user.email}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Navigation Items */}
                <nav className="flex-1 p-4">
                  <ul className="space-y-2" role="menu">
                    <NavItems user={user} mobile={true} closeMenu={closeMenu} />
                    {user && (
                      <>
                        <li role="menuitem">
                          <Link
                            to="/profile"
                            className="flex items-center space-x-2 block py-3 px-4 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition"
                            onClick={(e) => {
                              e.stopPropagation();
                              closeMenu();
                            }}
                          >
                            <span className="text-lg">👤</span>
                            <span>My Profile</span>
                          </Link>
                        </li>
                        <li role="menuitem">
                          <button
                            onClick={() => {
                              handleLogout();
                              closeMenu();
                            }}
                            className="flex items-center space-x-2 w-full text-left py-3 px-4 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 transition"
                          >
                            <span className="text-lg">🚪</span>
                            <span>Logout</span>
                          </button>
                        </li>
                      </>
                    )}
                  </ul>
                </nav>

                {/* Footer */}
                <div className="p-4 border-t border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      Theme
                    </span>
                    <ThemeToggle />
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </nav>
    </header>
  );
}

// Navigation items component
function NavItems({ user, mobile = false, closeMenu }) {
  // Public routes (always visible)
  const publicItems = [{ to: "/admin-auctions", label: "Admin Auctions" }];

  // Authenticated routes
  const authItems = user
    ? [
        { to: "/dashboard", label: "Dashboard" },
        { to: "/create-auction", label: "Create Auction" },
       // { to: "/my-bids", label: "My Bids" },
        ...(user.role === "admin"
          ? [{ to: "/admin-dashboard", label: "Admin Dashboard" }]
          : []),
      ]
    : [];

  // Guest routes
  const guestItems = !user
    ? [
        { to: "/login", label: "Login" },
        { to: "/register", label: "Register" },
      ]
    : [];

  const navItems = [...publicItems, ...authItems, ...guestItems];
 
  const handleLinkClick = useCallback(
    (e) => {
      e.stopPropagation();
      if (mobile && closeMenu) {
        closeMenu();
      }
    },
    [mobile, closeMenu],
  );

  return (
    <>
      {navItems.map((item, index) => (
        <li key={item.to || index} role="menuitem">
          <Link
            to={item.to}
            className={`flex items-center space-x-2 transition-colors ${
              mobile
                ? "py-3 px-4 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                : "px-3 py-2 rounded-lg text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10"
            }`}
            onClick={handleLinkClick}
          >
            <span>{item.label}</span>
          </Link>
        </li>
      ))}
    </>
  );
}

// Enhanced dropdown menu component
function DropdownMenu({ isOpen, onClose, onLogout, user }) {
  if (!isOpen) return null;

  return (
    <div className="absolute right-0 mt-3 w-64 bg-white dark:bg-gray-800 rounded-xl shadow-xl py-2 z-50 border border-gray-200 dark:border-gray-600 overflow-hidden">
      {/* User Info Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-700 dark:to-gray-600">
        <div className="flex items-center space-x-3">
          <img
            src={getAvatarUrl(user)}
            alt={`${user.username || "User"}'s profile`}
            className="w-12 h-12 rounded-full border-2 border-white dark:border-gray-300"
            onError={(e) => {
              e.target.style.display = "none";
              e.target.nextSibling.style.display = "flex";
            }}
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
              {user.username}
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
              {user.email}
            </p>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                user.role === "admin"
                  ? "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
                  : "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
              }`}
            >
              {user.role === "admin" ? "👑 Admin" : "👤 User"}
            </span>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-600">
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-2">
            <p className="text-xs text-green-600 dark:text-green-400">
              Active Bids
            </p>
            <p className="text-lg font-bold text-green-700 dark:text-green-300">
              5
            </p>
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-2">
            <p className="text-xs text-blue-600 dark:text-blue-400">
              Watchlist
            </p>
            <p className="text-lg font-bold text-blue-700 dark:text-blue-300">
              12
            </p>
          </div>
        </div>
      </div>

      {/* Menu Items */}
      <div className="py-1">
        <Link
          to="/profile"
          className="flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          onClick={onClose}
          role="menuitem"
        >
          <svg className="w-4 h-4 mr-3" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
              clipRule="evenodd"
            />
          </svg>
          My Profile
        </Link>
        <Link
          to="/my-bids"
          className="flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          onClick={onClose}
          role="menuitem"
        >
          <svg className="w-4 h-4 mr-3" fill="currentColor" viewBox="0 0 20 20">
            <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z"
              clipRule="evenodd"
            />
          </svg>
          My Bids
        </Link>
        <button
          onClick={onLogout}
          className="flex items-center w-full px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          role="menuitem"
        >
          <svg className="w-4 h-4 mr-3" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z"
              clipRule="evenodd"
            />
          </svg>
          Sign Out
        </button>
      </div>
    </div>
  );
}

export default Header;
