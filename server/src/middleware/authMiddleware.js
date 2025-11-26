import prisma from '../config/prisma.js';
import { verifyToken, isRefreshTokenValid } from '../services/tokenService.js';
import logger from '../utils/logger.js';
import { env } from '../config/env.js';

// Protect routes with JWT authentication
export const protect = async (req, res, next) => {
  try {
    let token;
    
    // Get token from Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    // Get token from cookies (for refresh token)
    else if (req.cookies?.refreshToken) {
      token = req.cookies.refreshToken;
    }

    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Not authorized, no token provided' 
      });
    }

    try {
      // Verify token
      const decoded = verifyToken(token);
      
      // Check if token type is valid (either 'access' or 'refresh')
      if (!['access', 'refresh'].includes(decoded.type)) {
        return res.status(401).json({ 
          success: false, 
          message: 'Invalid token type' 
        });
      }
      
      // If it's a refresh token, don't allow access to protected routes
      if (decoded.type === 'refresh') {
        return res.status(401).json({ 
          success: false, 
          message: 'Access token required' 
        });
      }

      // Get user from the database
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          createdAt: true,
          updatedAt: true,
          firstname: true,
          middlename: true,
          lastname: true,
          username: true,
          email: true,
          phone: true,
          role: true,
          rating: true,
          bio: true,
          location: true,
          isVerified: true,
          lastActiveAt: true
        },
      });
      
      // Update lastActiveAt timestamp for a user in the background
      if (user) {
        prisma.user.update({
          where: { id: user.id },
          data: { lastActiveAt: new Date() }
        }).catch(error => {
          logger.error('Failed to update lastActiveAt:', error);
        });
      }
      
      if (!user) {
        return res.status(401).json({ 
          success: false, 
          message: 'User not found' 
        });
      }

      // Attach user to request object (id only)
      req.user = { ...user };
      next();
    } catch (error) {
      if (error.message === 'Token expired') {
        return res.status(401).json({ 
          success: false, 
          message: 'Session expired, please log in again' 
        });
      }
      
      logger.error('Token verification error:', error);
      return res.status(401).json({ 
        success: false, 
        message: 'Not authorized, token verification failed' 
      });
    }
  } catch (error) {
    logger.error('Authentication error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Server error during authentication' 
    });
  }
};

// Role-based access control middleware
export const role = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role ${req.user.role} is not authorized to access this route`
      });
    }

    next();
  };
};

// Admin middleware (shortcut for role('admin'))
export const admin = role('admin');

// Verify refresh token middleware
export const verifyRefreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.cookies;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'No refresh token provided'
      });
    }

    // Verify the refresh token
    const decoded = verifyToken(refreshToken);
    
    if (decoded.type !== 'refresh') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token type'
      });
    }

    // Check if the refresh token is valid in Redis
    const isValid = await isRefreshTokenValid(decoded.userId, refreshToken);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token'
      });
    }

    // Attach user ID to request for later use
    req.userId = decoded.userId;
    req.refreshToken = refreshToken;
    next();
  } catch (error) {
    logger.error('Refresh token verification error:', error);
    
    // Clear invalid refresh token cookie
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: env.isProd,
      sameSite: 'strict'
    });

    res.status(401).json({
      success: false,
      message: error.message === 'Token expired' ? 'Session expired, please log in again' : 'Invalid refresh token'
    });
  }
};
