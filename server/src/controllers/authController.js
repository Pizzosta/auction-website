import User from '../models/User.js';
import zxcvbn from 'zxcvbn';
import crypto from 'crypto';
import { addToQueue } from '../services/emailQueue.js';
import logger from '../utils/logger.js';
import { env, validateEnv } from '../config/env.js';
import {
  generateAccessToken,
  generateRefreshToken,
} from '../services/tokenService.js';

// Validate required environment variables
const missingVars = validateEnv();
if (missingVars.length > 0) {
    logger.error(`Missing required environment variables: ${missingVars.join(', ')}`);
    process.exit(1);
}

// Password strength checker
const checkPasswordStrength = (password) => {
    const hasMinLength = password.length >= 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[^A-Za-z0-9]/.test(password);

    return {
        isValid: hasMinLength && hasUpperCase && hasLowerCase && hasNumbers && hasSpecialChar,
        issues: {
            minLength: !hasMinLength ? 'Must be at least 8 characters' : null,
            upperCase: !hasUpperCase ? 'Must contain at least one uppercase letter' : null,
            lowerCase: !hasLowerCase ? 'Must contain at least one lowercase letter' : null,
            numbers: !hasNumbers ? 'Must contain at least one number' : null,
            specialChar: !hasSpecialChar ? 'Must contain at least one special character' : null
        }
    };
};

export const register = async (req, res) => {
    try {
        const {
            firstname,
            middlename,
            lastname,
            phone,
            username,
            email,
            password,
            confirmPassword
        } = req.body;

        // Check password match
        if (password !== confirmPassword) {
            return res.status(400).json({
                status: 'error',
                message: 'Passwords do not match',
            });
        }

        // Check password strength
        const passwordCheck = checkPasswordStrength(password);
        if (!passwordCheck.isValid) {
            return res.status(400).json({
                status: 'error',
                message: 'Password does not meet requirements',
                issues: Object.values(passwordCheck.issues).filter(Boolean)
            });
        }

        const strength = zxcvbn(password);
        if (strength.score < 3) {
            return res.status(400).json({
                status: 'error',
                message: 'Password is too weak',
                suggestions: strength.feedback?.suggestions || []
            });
        }

        const normalizedEmail = email?.trim().toLowerCase();

        // Check if user exists
        const userByEmail = await User.findOne({ email: normalizedEmail });
        if (userByEmail) {
            return res.status(400).json({
                status: 'error',
                message: 'Email is already in use'
            });
        }

        const userByUsername = await User.findOne({ username });
        if (userByUsername) {
            return res.status(400).json({
                status: 'error',
                message: 'Username is already taken'
            });
        }

        // Create user
        const user = await User.create({
            firstname,
            middlename,
            lastname,
            phone,
            username,
            email,
            password,
        });

        await user.save();

        // Add welcome email to queue
        try {
            await addToQueue('welcomeUser', user.email, {
                name: user.firstname,
                email: user.email,
                username: user.username
            });
            console.log(`Welcome User email queued for ${user.email}`);
        } catch (error) {
            console.error('Failed to queue welcome user email:', error);
            // Continue with registration even if queueing fails
        }

        // Generate JWT token
        const token = jwt.sign({ userId: user._id, email: user.email, role: user.role }, env.jwtSecret, { expiresIn: env.jwtExpire });

        res.status(201).json({
            status: 'success',
            data: {
                user: {
                    _id: user._id,
                    firstname: user.firstname,
                    lastname: user.lastname,
                    username: user.username,
                    email: user.email,
                    phone: user.phone,
                    role: user.role
                },
                token,
            }
        });
    } catch (error) {
        logger.error('Login error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Check if user exists
        const user = await User.findOne({ email: email?.trim().toLowerCase() }).select('+password');
        if (!user) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // Check password
        const isMatch = await user.matchPassword(password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }
        
        // Update last login timestamp
        user.lastLogin = new Date();
        await user.save();

        // Generate tokens
        const accessToken = generateAccessToken(user._id, user.email, user.role);
        const refreshToken = await generateRefreshToken(user._id, user.email, user.role);

        // Set refresh token as HTTP-only cookie
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: env.nodeEnv === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        res.json({
            status: 'success',
            data: {
                user: {
                    _id: user._id,
                    firstname: user.firstname,
                    lastname: user.lastname,
                    username: user.username,
                    email: user.email,
                    phone: user.phone,
                    role: user.role
                },
                accessToken,
                expiresIn: env.accessTokenExpiry
            }
        });
    } catch (error) {
        logger.error('Login error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        // Find user by email
        const user = await User.findOne({ email: email?.trim().toLowerCase() });

        // Don't reveal if user doesn't exist (security best practice)
        if (!user) {
            return res.status(200).json({
                status: 'success',
                message: 'If an account with that email exists, a password reset link has been sent.'
            });
        }

        // Generate reset token and save hashed version to database
        const resetToken = user.getResetPasswordToken();
        await user.save({ validateBeforeSave: false });

        // Create reset URL - use the unhashed token in the URL
        const resetUrl = `${env.clientUrl}/reset-password/${resetToken}`;

        // Send email
        try {
            const rawExpire = env.resetTokenExpire;
            const expireInMinutes = rawExpire.endsWith('m')
                ? `${rawExpire.replace('m', '')} minutes`
                : rawExpire;

            await addToQueue('resetPassword', user.email, {
                name: user.firstname,
                resetUrl,
                expiresIn: expireInMinutes
            });

            return res.status(200).json({
                status: 'success',
                message: 'Password reset link sent to email'
            });
        } catch (error) {
            console.error('Error sending password reset email:', error);
            user.resetPasswordToken = undefined;
            user.resetPasswordExpire = undefined;
            await user.save({ validateBeforeSave: false });

            return res.status(500).json({
                status: 'error',
                message: 'Email could not be sent'
            });
        }
    } catch (error) {
        console.error('Forgot password error:', error);
        return res.status(500).json({
            status: 'error',
            message: 'Server error'
        });
    }
};

export const resetPassword = async (req, res) => {
    try {
        const { token } = req.params;
        const { password, confirmPassword } = req.body;

        // Check if token is valid
        if (!token || typeof token !== 'string' || token.length !== 64) {
            logger.warn('Reset token validation failed', {
                reason: 'Invalid token type',
                tokenType: typeof token,
                tokenLength: typeof token === 'string' ? token.length : 'N/A',
                ip: req.ip,
                route: req.originalUrl,
                timestamp: new Date().toISOString(),
            });

            return res.status(400).json({
                status: 'error',
                message: 'Invalid reset token format',
                details: `Expected 64-character hex string, got ${typeof token === 'string' ? token.length : 'N/A'} characters`
            });
        }

        // Decode URL-encoded characters in the token
        const decodedToken = decodeURIComponent(token);

        // Log token details for debugging
        logger.info('Reset token received', {
            originalToken: token,
            decodedToken,
            tokenLength: decodedToken.length,
            isHex: /^[0-9a-fA-F]+$/.test(decodedToken)
        });

        // Check if passwords match
        if (password !== confirmPassword) {
            return res.status(400).json({
                status: 'error',
                message: 'Passwords do not match'
            });
        }

        // Check password strength
        const passwordCheck = checkPasswordStrength(password);
        if (!passwordCheck.isValid) {
            return res.status(400).json({
                status: 'error',
                message: 'Password does not meet requirements',
                issues: Object.values(passwordCheck.issues).filter(Boolean)
            });
        }

        const strength = zxcvbn(password);
        if (strength.score < 3) {
            return res.status(400).json({
                status: 'error',
                message: 'Password is too weak',
                suggestions: strength.feedback?.suggestions || []
            });
        }

        // Get hashed token using the decoded token
        const resetPasswordToken = crypto
            .createHash('sha256')
            .update(decodedToken)
            .digest('hex');

        // Find user by reset token and check expiration
        const user = await User.findOne({
            resetPasswordToken,
            resetPasswordExpire: { $gt: Date.now() }
        }).select('+password');

        if (!user) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid or expired reset token'
            });
        }

        // Check if new password is the same as the old one
        const isMatch = await user.matchPassword(password);
        if (isMatch) {
            return res.status(400).json({
                status: 'error',
                message: 'New password cannot be the same as the old password'
            });
        }

        // Set new password
        user.password = password;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpire = undefined;

        await user.save();

        // Send confirmation email
        try {
            await addToQueue('passwordResetConfirmation', user.email, {
                name: user.firstname
            });
        } catch (emailError) {
            console.error('Error sending password reset confirmation email:', emailError);
            // Don't fail the request if email fails
        }

        // Generate new JWT token
        const authToken = jwt.sign(
            { userId: user._id, email: user.email, role: user.role },
            env.jwtSecret,
            { expiresIn: env.jwtExpire }
        );

        res.status(200).json({
            status: 'success',
            message: 'Password reset successful',
            data: {
                token: authToken,
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
        console.error('Reset password error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Server error'
        });
    }
};
