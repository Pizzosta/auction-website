import {
  generateAccessToken,
  generateRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokens,
} from '../services/tokenService.js';
import { findUserByIdPrisma } from '../repositories/userRepo.prisma.js';
import logger from '../utils/logger.js';
import { env } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * Refresh access token using a valid refresh token
 */
export const refreshToken = async (req, res, next) => {
  try {
    const { userId, refreshToken } = req;

    // Get user with only necessary fields for token generation
    const user = await findUserByIdPrisma(userId, [
      'id',
      'firstname',
      'middlename',
      'lastname',
      'email',
      'role'
    ]);

    if (!user) {
      throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    }

    // Generate new access token
    const newAccessToken = generateAccessToken(user.id, user.email, user.role);

    // Optionally rotate refresh token (uncomment if you want to rotate refresh tokens on each use)
    const newRefreshToken = await generateRefreshToken(user.id, user.email, user.role);

    // Set new refresh token cookie (if rotating refresh tokens)
    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
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
          id: user.id,
          firstname: user.firstname,
          middlename: user.middlename,
          lastname: user.lastname,
          email: user.email,
          role: user.role,
        },
      },
    });
  } catch (error) {
    logger.error('Token refresh error:', error);
    next(error);
  }
};

/**
 * Logout user by revoking all refresh tokens
 */
export const logout = async (req, res, next) => {
  try {
    const { userId } = req;

    // Revoke all refresh tokens for this user
    await revokeAllRefreshTokens(userId);

    // Clear the refresh token cookie
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });

    res.json({
      success: true,
      message: 'Successfully logged out',
    });
  } catch (error) {
    logger.error('Logout error:', error);
    next(error);
  }
};

/**
 * Logout from all devices by revoking all refresh tokens for the user
 */
export const logoutAllDevices = async (req, res, next) => {
  try {
    const { userId } = req;

    // Revoke all refresh tokens for this user
    await revokeAllRefreshTokens(userId);

    // Clear the refresh token cookie
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });

    res.json({
      success: true,
      message: 'Successfully logged out from all devices',
    });
  } catch (error) {
    logger.error('Logout all devices error:', error);
    next(error);
  }
};
