import { MoonIcon, SunIcon } from '@heroicons/react/24/outline';
import { useTheme } from "../context/ThemeContext";

function OldThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className={`relative flex items-center justify-center w-12 h-6 rounded-full p-1 transition-all duration-300 ease-in-out ${
        theme === "light"
          ? "bg-gray-300 hover:bg-gray-400"
          : "bg-gray-700 hover:bg-gray-600"
      }`}
      aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
      aria-pressed={theme === "dark"}
    >
      {/* Track */}
      <div className="absolute inset-0 rounded-full overflow-hidden">
        <div
          className={`absolute inset-0 transition-opacity duration-300 ${
            theme === "light" ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-yellow-300 to-orange-400"></div>
        </div>
        <div
          className={`absolute inset-0 transition-opacity duration-300 ${
            theme === "dark" ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-gray-800 to-blue-900"></div>
        </div>
      </div>
      
      {/* Thumb with icons */}
      <div
        className={`absolute left-1 w-4 h-4 rounded-full bg-white shadow-md transform transition-transform duration-300 flex items-center justify-center ${
          theme === "light" ? "translate-x-0" : "translate-x-6"
        }`}
      >
        <div
          className={`absolute transition-opacity duration-200 ${
            theme === "light" ? "opacity-100" : "opacity-0"
          }`}
        >
          <SunIcon className="text-yellow-500 text-xs" />
        </div>
        <div
          className={`absolute transition-opacity duration-200 ${
            theme === "dark" ? "opacity-100" : "opacity-0"
          }`}
        >
          <MoonIcon className="text-blue-400 text-xs" />
        </div>
      </div>
      
      {/* Icons on track */}
      <div className="relative flex justify-between w-full">
        <SunIcon
          className={`text-xs transition-opacity duration-300 ${
            theme === "light" ? "text-yellow-500 opacity-100" : "text-gray-400 opacity-50"
          }`}
        />
        <MoonIcon
          className={`text-xs transition-opacity duration-300 ${
            theme === "dark" ? "text-blue-300 opacity-100" : "text-gray-400 opacity-50"
          }`}
        />
      </div>
    </button>
  );
}

export default OldThemeToggle;
