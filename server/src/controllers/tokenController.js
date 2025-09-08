import { 
  generateAccessToken, 
  generateRefreshToken, 
  revokeRefreshToken,
  revokeAllRefreshTokens,
} from '../services/tokenService.js';
import User from '../models/User.js';
import logger from '../utils/logger.js';
import { env } from '../config/env.js';

/**
 * Refresh access token using a valid refresh token
 */
export const refreshToken = async (req, res) => {
  try {
    const { userId, refreshToken } = req;
    
    // Get user from database
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Generate new access token
    const newAccessToken = generateAccessToken(user._id, user.email, user.role);
    
    // Optionally rotate refresh token (uncomment if you want to rotate refresh tokens on each use)
    const newRefreshToken = await generateRefreshToken(user._id, user.email, user.role);
    
    // Set new refresh token cookie (if rotating refresh tokens)
    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // If rotating refresh tokens, revoke the old one
    await revokeRefreshToken(userId, refreshToken);

    res.json({
      success: true,
      data: {
        accessToken: newAccessToken,
        expiresIn: env.accessTokenExpiry,
        refreshToken: newRefreshToken,
        user: {
          _id: user._id,
          firstname: user.firstname,
          lastname: user.lastname,
          email: user.email,
          role: user.role
        }
      }
    });
  } catch (error) {
    logger.error('Token refresh error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to refresh token'
    });
  }
};

/**
 * Logout user by revoking all refresh tokens
 */
export const logout = async (req, res) => {
  try {
    const { userId } = req;
    
    // Revoke all refresh tokens for this user
    await revokeAllRefreshTokens(userId);
    
    // Clear the refresh token cookie
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });
    
    res.json({
      success: true,
      message: 'Successfully logged out'
    });
  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to log out'
    });
  }
};

/**
 * Logout from all devices by revoking all refresh tokens for the user
 */
export const logoutAllDevices = async (req, res) => {
  try {
    const { userId } = req;
    
    // Revoke all refresh tokens for this user
    await revokeAllRefreshTokens(userId);
    
    // Clear the refresh token cookie
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });
    
    res.json({
      success: true,
      message: 'Successfully logged out from all devices'
    });
  } catch (error) {
    logger.error('Logout all devices error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to log out from all devices'
    });
  }
};
