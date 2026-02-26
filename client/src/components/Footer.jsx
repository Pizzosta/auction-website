import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function Footer() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const currentYear = new Date().getFullYear();

  // Dynamic links based on auth state
  const quickLinks = [
    { to: "/", label: "Dashboard", icon: "🏠", show: true },
    { to: "/auctions", label: "Browse Auctions", icon: "🔍", show: true },
    {
      to: "/create-auction",
      label: "Create Auction",
      icon: "➕",
      show: !!user,
    },
    { to: "/my-bids", label: "My Bids", icon: "💰", show: !!user },
    { to: "/profile", label: "Profile", icon: "👤", show: !!user },
    { to: "/help", label: "Help Center", icon: "❓", show: true },
  ].filter((link) => link.show);

  const socialLinks = [
    { icon: "📘", label: "Facebook", href: "#", color: "hover:bg-blue-500" },
    { icon: "🐦", label: "Twitter", href: "#", color: "hover:bg-sky-500" },
    { icon: "📷", label: "Instagram", href: "#", color: "hover:bg-pink-500" },
    { icon: "💼", label: "LinkedIn", href: "#", color: "hover:bg-blue-700" },
  ];

  return (
    <footer className="bg-gradient-to-br from-blue-700 via-blue-800 to-indigo-900 dark:from-gray-900 dark:via-gray-800 dark:to-black text-white mt-auto relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-white/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-white/5 rounded-full blur-3xl" />
      </div>

      {/* Main Footer Content */}
      <div className="container mx-auto px-4 py-12 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Company Info */}
          <div className="lg:col-span-1">
            <div
              className="flex items-center mb-4 group cursor-pointer"
              onClick={() => navigate("/")}
            >
              <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center mr-3 shadow-lg group-hover:scale-110 transition-transform duration-300">
                <span className="text-blue-600 font-bold text-lg">KA</span>
              </div>
              <div>
                <h3 className="text-xl font-bold">Kawodze</h3>
                <p className="text-sm text-blue-200 dark:text-gray-400">
                  Auctions
                </p>
              </div>
            </div>
            <p className="text-blue-100 dark:text-gray-300 text-sm mb-6 leading-relaxed">
              Your trusted platform for online auctions. Discover unique items,
              place bids, and win amazing deals in a secure environment.
            </p>

            {/* Social Media Links */}
            <div className="flex space-x-3">
              {socialLinks.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  aria-label={social.label}
                  className={`w-10 h-10 bg-white/10 rounded-full flex items-center justify-center ${social.color} hover:scale-110 transition-all duration-300 backdrop-blur-sm`}
                >
                  <span className="text-lg">{social.icon}</span>
                </a>
              ))}
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-lg font-semibold mb-4 flex items-center">
              <span className="w-1 h-6 bg-yellow-400 rounded-full mr-3" />
              Quick Links
            </h4>
            <ul className="space-y-3">
              {quickLinks.map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className="text-blue-100 dark:text-gray-300 hover:text-white hover:translate-x-1 transition-all duration-200 text-sm flex items-center group"
                  >
                    <span className="mr-3 opacity-70 group-hover:opacity-100 transition-opacity">
                      {link.icon}
                    </span>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Categories */}
          <div>
            <h4 className="text-lg font-semibold mb-4 flex items-center">
              <span className="w-1 h-6 bg-green-400 rounded-full mr-3" />
              Categories
            </h4>
            <ul className="space-y-3">
              {[
                "Electronics",
                "Fashion",
                "Home & Garden",
                "Collectibles",
                "Vehicles",
              ].map((cat) => (
                <li key={cat}>
                  <Link
                    to={`/auctions?category=${cat.toLowerCase().replace(" & ", "-")}`}
                    className="text-blue-100 dark:text-gray-300 hover:text-white hover:translate-x-1 transition-all duration-200 text-sm flex items-center"
                  >
                    <span className="mr-2">→</span>
                    {cat}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact Info */}
          <div>
            <h4 className="text-lg font-semibold mb-4 flex items-center">
              <span className="w-1 h-6 bg-red-400 rounded-full mr-3" />
              Contact Us
            </h4>
            <ul className="space-y-4">
              <li className="flex items-start text-blue-100 dark:text-gray-300 text-sm group">
                <span className="mr-3 text-lg group-hover:scale-110 transition-transform">
                  📍
                </span>
                <span>
                  <strong className="text-white block mb-1">Address</strong>
                  Ashley Road, Kasoa
                  <br />
                  Greater Accra, Ghana
                </span>
              </li>
              <li className="flex items-center text-blue-100 dark:text-gray-300 text-sm group">
                <span className="mr-3 text-lg group-hover:scale-110 transition-transform">
                  📞
                </span>
                <div>
                  <strong className="text-white block text-xs mb-1">
                    Phone
                  </strong>
                  <a
                    href="tel:+233500000628"
                    className="hover:text-white transition-colors"
                  >
                    +233 (0) 50 000 0628
                  </a>
                </div>
              </li>
              <li className="flex items-center text-blue-100 dark:text-gray-300 text-sm group">
                <span className="mr-3 text-lg group-hover:scale-110 transition-transform">
                  ✉️
                </span>
                <div>
                  <strong className="text-white block text-xs mb-1">
                    Email
                  </strong>
                  <a
                    href="mailto:support@kawodze.com"
                    className="hover:text-white transition-colors"
                  >
                    support@kawodze.com
                  </a>
                </div>
              </li>
              <li className="flex items-center text-blue-100 dark:text-gray-300 text-sm">
                <span className="mr-3 text-lg">🕒</span>
                <span className="flex items-center">
                  <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse mr-2" />
                  24/7 Support Available
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Newsletter Section */}
      <div className="border-y border-white/10 bg-white/5 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <h5 className="font-semibold text-lg">Stay Updated</h5>
              <p className="text-blue-200 dark:text-gray-400 text-sm">
                Get notified about new auctions and exclusive deals
              </p>
            </div>
            <form
              className="flex w-full md:w-auto gap-2"
              onSubmit={(e) => e.preventDefault()}
            >
              <input
                type="email"
                placeholder="Enter your email"
                className="px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-blue-200 focus:outline-none focus:ring-2 focus:ring-yellow-400 w-full md:w-64"
              />
              <button
                type="submit"
                className="px-6 py-2 bg-yellow-400 hover:bg-yellow-500 text-blue-900 font-semibold rounded-lg transition-colors duration-200 whitespace-nowrap"
              >
                Subscribe
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Footer Bottom */}
      <div className="bg-black/20">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-blue-100 dark:text-gray-400 text-sm text-center md:text-left">
              <p>&copy; {currentYear} Kawodze Auctions. All rights reserved.</p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-6">
              <Link
                to="/privacy"
                className="text-blue-100 dark:text-gray-400 hover:text-white transition-colors text-sm"
              >
                Privacy Policy
              </Link>
              <Link
                to="/terms"
                className="text-blue-100 dark:text-gray-400 hover:text-white transition-colors text-sm"
              >
                Terms of Service
              </Link>
              <Link
                to="/cookies"
                className="text-blue-100 dark:text-gray-400 hover:text-white transition-colors text-sm"
              >
                Cookie Policy
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
