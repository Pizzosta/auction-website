import { forwardRef } from "react";

const sizes = {
  xs: "w-3 h-3",
  sm: "w-4 h-4",
  md: "w-6 h-6",
  lg: "w-8 h-8",
  xl: "w-12 h-12",
  "2xl": "w-16 h-16",
};

const strokeWidths = {
  xs: "stroke-[3]",
  sm: "stroke-[2.5]",
  md: "stroke-2",
  lg: "stroke-2",
  xl: "stroke-[1.5]",
  "2xl": "stroke-[1.5]",
};

const Spinner = forwardRef(
  (
    {
      size = "md",
      color = "blue",
      variant = "border",
      className = "",
      label = "Loading...",
      showLabel = false,
      centered = false,
      fullScreen = false,
      ...props
    },
    ref
  ) => {
    const sizeClasses = sizes[size] || sizes.md;
    const strokeClass = strokeWidths[size] || strokeWidths.md;

    const colorClasses = {
      blue: "text-blue-600 dark:text-blue-400",
      white: "text-white",
      gray: "text-gray-600 dark:text-gray-400",
      red: "text-red-600 dark:text-red-400",
      green: "text-green-600 dark:text-green-400",
      yellow: "text-yellow-600 dark:text-yellow-400",
      purple: "text-purple-600 dark:text-purple-400",
      current: "text-current",
    };

    const colorClass = colorClasses[color] || colorClasses.blue;

    // Border spinner (circular border animation)
    if (variant === "border") {
      return (
        <div
          ref={ref}
          className={`
            inline-flex items-center justify-center
            ${centered ? "fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" : ""}
            ${fullScreen ? "fixed inset-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm" : ""}
            ${className}
          `}
          role="status"
          aria-live="polite"
          aria-busy="true"
          {...props}
        >
          <div className="flex flex-col items-center gap-3">
            <div
              className={`
                ${sizeClasses}
                ${colorClass}
                animate-spin
                rounded-full
                border-2
                border-current
                border-t-transparent
              `}
            />
            {(showLabel || centered || fullScreen) && (
              <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                {label}
              </span>
            )}
            <span className="sr-only">{label}</span>
          </div>
        </div>
      );
    }

    // Dots variant (bouncing dots)
    if (variant === "dots") {
      return (
        <div
          ref={ref}
          className={`
            inline-flex items-center justify-center
            ${centered ? "fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" : ""}
            ${fullScreen ? "fixed inset-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm" : ""}
            ${className}
          `}
          role="status"
          aria-live="polite"
          aria-busy="true"
          {...props}
        >
          <div className="flex flex-col items-center gap-3">
            <div className="flex space-x-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={`
                    ${sizeClasses}
                    ${colorClass}
                    rounded-full
                    animate-bounce
                    bg-current
                  `}
                  style={{
                    animationDelay: `${i * 0.15}s`,
                    width: `calc(${sizeClasses.match(/\d+/)[0]}px * 0.3)`,
                    height: `calc(${sizeClasses.match(/\d+/)[0]}px * 0.3)`,
                  }}
                />
              ))}
            </div>
            {(showLabel || centered || fullScreen) && (
              <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                {label}
              </span>
            )}
            <span className="sr-only">{label}</span>
          </div>
        </div>
      );
    }

    // Pulse variant (pulsing circle)
    if (variant === "pulse") {
      return (
        <div
          ref={ref}
          className={`
            inline-flex items-center justify-center
            ${centered ? "fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" : ""}
            ${fullScreen ? "fixed inset-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm" : ""}
            ${className}
          `}
          role="status"
          aria-live="polite"
          aria-busy="true"
          {...props}
        >
          <div className="flex flex-col items-center gap-3">
            <div
              className={`
                ${sizeClasses}
                ${colorClass}
                rounded-full
                bg-current
                animate-pulse
              `}
            />
            {(showLabel || centered || fullScreen) && (
              <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                {label}
              </span>
            )}
            <span className="sr-only">{label}</span>
          </div>
        </div>
      );
    }

    // SVG Circle variant (smooth rotating SVG)
    return (
      <div
        ref={ref}
        className={`
          inline-flex items-center justify-center
          ${centered ? "fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" : ""}
          ${fullScreen ? "fixed inset-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm" : ""}
          ${className}
        `}
        role="status"
        aria-live="polite"
        aria-busy="true"
        {...props}
      >
        <div className="flex flex-col items-center gap-3">
          <svg
            className={`${sizeClasses} ${colorClass} animate-spin`}
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          {(showLabel || centered || fullScreen) && (
            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
              {label}
            </span>
          )}
          <span className="sr-only">{label}</span>
        </div>
      </div>
    );
  }
);

Spinner.displayName = "Spinner";

export default Spinner;