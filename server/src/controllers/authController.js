import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import zxcvbn from 'zxcvbn';
import { sendTemplateEmail } from '../utils/emailService.js';
import { addToQueue } from '../services/emailQueue.js';

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
        const token = jwt.sign({ userId: user._id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' });

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
        console.error(error);
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

        // Generate JWT token
        const token = jwt.sign({ userId: user._id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' });

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
                token,
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};
