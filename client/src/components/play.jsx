{
  /* Back to Top Button */
}
<button
  onClick={() => scrollToTop("smooth")}
  className="fixed bottom-6 right-6 w-12 h-12 bg-yellow-400 hover:bg-yellow-500 text-blue-900 rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-300 z-50 group"
  aria-label="Back to top"
  title="Back to top"
>
  <svg
    className="w-6 h-6 transform group-hover:-translate-y-1 transition-transform duration-200"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    strokeWidth={2.5}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M5 10l7-7m0 0l7 7m-7-7v18"
    />
  </svg>
</button>;
