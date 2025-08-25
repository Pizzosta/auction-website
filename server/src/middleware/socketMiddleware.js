// This middleware makes the socket.io instance available in route handlers
export const socketMiddleware = (req, res, next) => {
  // The app.set('io', io) in server.js makes the io instance available here
  req.io = req.app.get('io');
  next();
};
