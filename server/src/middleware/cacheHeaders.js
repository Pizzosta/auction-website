// Simple middleware to set Cache-Control headers for GET responses
export default function cacheHeaders(defaultTtl = 60) {
  return (req, res, next) => {
    // Only set headers for GET requests
    if (req.method !== 'GET') return next();

    // Allow route handlers to override TTL via res.locals.cacheTtl
    const ttl = typeof res.locals.cacheTtl === 'number' ? res.locals.cacheTtl : defaultTtl;

    // Public cache for anonymous responses; if Authorization header present mark as private
    const isPrivate = !!req.headers.authorization;

    const cacheControl = isPrivate
      ? `private, max-age=${ttl}, s-maxage=${Math.max(0, Math.floor(ttl / 2))}`
      : `public, max-age=${ttl}, s-maxage=${ttl}`;

    res.setHeader('Cache-Control', cacheControl);

    // Add a small Vary header to indicate responses may vary by Accept-Encoding
    res.vary && res.vary('Accept-Encoding');

    next();
  };
}
