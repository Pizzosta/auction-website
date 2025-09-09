import User from '../models/User.js';
import { getCloudinary } from '../config/cloudinary.js';
import { normalizeToE164 } from '../utils/format.js';

// @desc    Get all users (admin only)
// @route   GET /api/users
// @access  Private/Admin
export const getAllUsers = async (req, res) => {
    try {
        // Get pagination parameters (already validated by middleware)
        const { role, isVerified, rating, search, page = 1, limit = 10, sort = 'createdAt:desc' } = req.query;

        // Parse pagination parameters
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(Math.max(1, parseInt(limit)), 100); // Cap at 100
        const skip = (pageNum - 1) * limitNum;


        // Build sort object if sort parameter is provided
        const [field, order] = sort.split(':');
        const sortOptions = {
            [field]: order === 'desc' ? -1 : 1
        };

        // Build query
        const query = {};

        // Filter by role if provided
        if (role) {
            query.role = role;
        }

        // Filter by verified status if provided
        if (isVerified) {
            query.isVerified = isVerified;
        }

        //filter by rating if provided
        if (rating) {
            query.rating = rating;
        }

        // Search by name, email, or username if search query is provided
        if (search) {
            const searchRegex = new RegExp(search, 'i');
            query.$or = [
                { firstname: searchRegex },
                { lastname: searchRegex },
                { email: searchRegex },
                { phone: searchRegex },
                { username: searchRegex }
            ];
        }

        // Execute query with pagination and sorting
        const users = await User.find(query)
            .select('-password -__v')
            .sort(sortOptions)
            .limit(limitNum)
            .skip(skip)
            .lean();

        // Get total count for pagination
        const count = await User.countDocuments(query);
        const totalPages = Math.ceil(count / limitNum);

        res.status(200).json({
            status: 'success',
            pagination: {
                currentPage: pageNum,
                totalUsers: count,
                totalPages,
                hasNext: pageNum < totalPages,
                hasPrev: pageNum > 1,
            },
            data: {
                users
            }
        });
    } catch (error) {
        logger.error('Get all users error:', {
            error: error.message,
            stack: error.stack,
            query: req.query
        });

        res.status(500).json({
            status: 'error',
            message: 'Server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

// @desc    Delete a user
// @route   DELETE /api/users/:id
// @access  Private/Admin
export const deleteUser = async (req, res) => {
    try {
        const { password } = req.body;
        const user = await User.findById(req.params.id).select('+password');

        if (!user) {
            return res.status(404).json({
                status: 'error',
                message: 'User not found',
            });
        }

        // Allow deletion only if admin or the user themselves
        if (user._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({
                status: 'error',
                message: 'Not authorized to delete this user',
            });
        }

        // If user is deleting their own account, require password
        if (user._id.toString() === req.user._id.toString()) {
            if (!password) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Password is required to confirm account deletion',
                });
            }

            const isMatch = await user.matchPassword(password);
            if (!isMatch) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Incorrect password',
                });
            }
        }

        // Prevent admin from deleting themselves
        if (user.role === 'admin' && user._id.toString() === req.user._id.toString()) {
            return res.status(400).json({
                status: 'error',
                message: 'Admins cannot delete themselves',
            });
        }

        await User.deleteOne({ _id: user._id });

        res.status(200).json({
            status: 'success',
            data: null,
            message: 'User deleted successfully',
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: 'error',
            message: 'Server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

// @desc    Get current user
// @route   GET /api/users/me
// @access  Private
export const getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-password -__v');
        if (!user) {
            return res.status(404).json({
                status: 'error',
                message: 'User not found'
            });
        }

        res.json({
            status: 'success',
            data: {
                user
            }
        });
    } catch (error) {
        console.error('Get me error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

// @desc    Upload profile picture
// @route   POST /api/users/me/upload-picture
// @access  Private
export const uploadProfilePicture = async (req, res) => {
    try {
        if (!req.uploadedFiles || req.uploadedFiles.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded or file upload failed',
            });
        }

        const uploadedFile = req.uploadedFiles[0];
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({
                status: 'error',
                message: 'User not found'
            });
        }

        // Delete old profile picture if exists
        if (user.profilePicture && user.profilePicture.publicId) {
            try {
                const cloudinary = await getCloudinary();
                await cloudinary.uploader.destroy(user.profilePicture.publicId);
            } catch (error) {
                console.error('Error deleting old profile picture:', error);
            }
        }

        // Update user with new profile picture
        user.profilePicture = {
            url: uploadedFile.url,
            publicId: uploadedFile.publicId
        };

        await user.save();

        res.status(200).json({
            success: true,
            message: 'Profile picture uploaded successfully',
            data: user.profilePicture
        });
    } catch (error) {
        console.error('Error uploading profile picture:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while uploading profile picture',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// @desc    Delete profile picture
// @route   DELETE /api/users/me/remove-picture
// @access  Private
export const deleteProfilePicture = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({
                status: 'error',
                message: 'User not found'
            });
        }

        if (!user.profilePicture || !user.profilePicture.publicId) {
            return res.status(400).json({
                success: false,
                message: 'No profile picture found to delete'
            });
        }

        // Delete from Cloudinary
        try {
            const cloudinary = await getCloudinary();
            await cloudinary.uploader.destroy(user.profilePicture.publicId);
        } catch (error) {
            console.error('Error deleting profile picture from Cloudinary:', error);
            // Continue even if Cloudinary deletion fails to update the database
        }

        // Clear profile picture in database
        user.profilePicture = { url: '', publicId: '' };
        await user.save();

        res.status(200).json({
            success: true,
            message: 'Profile picture removed successfully'
        });
    } catch (error) {
        console.error('Error removing profile picture:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while removing profile picture',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// @desc    Update a user
// @route   PATCH /api/users/:id
// @access  Private/Admin
export const updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        // Ensure the request body is not empty before proceeding
        if (!updateData || Object.values(updateData).every(v => v === '' || v === null || v === undefined)) {
            return res.status(400).json({
                status: 'fail',
                message: 'No data provided for update.',
            });
        }

        // Ensure request has a valid user object (from protect middleware)
        if (!req.user || !req.user._id) {
            return res.status(401).json({
                status: 'error',
                message: 'Authentication required',
            });
        }

        // Find the user and include the password for verification
        let user = await User.findById(id).select('+password');

        if (!user) {
            return res.status(404).json({
                status: 'error',
                message: 'User not found',
            });
        }

        // Check if the user is updating their own profile or is an admin
        if (user._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({
                status: 'error',
                message: 'Not authorized to update this user',
            });
        }

        // Prevent role modification unless admin
        if ('role' in updateData && updateData.role && req.user.role !== 'admin') {
            return res.status(403).json({
                status: 'error',
                message: 'Not authorized to modify user role',
            });
        }

        // Handle password update with enhanced validation
        if (updateData.password) {
            if (!updateData.currentPassword) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Current password is required to update password',
                });
            }

            const isPasswordValid = await user.matchPassword(updateData.currentPassword);
            if (!isPasswordValid) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Current password is incorrect',
                });
            }

            const isSamePassword = await user.matchPassword(updateData.password);
            if (isSamePassword) {
                return res.status(400).json({
                    status: 'error',
                    message: 'New password must be different from current password',
                });
            }

            delete updateData.currentPassword;
        } else {
            delete updateData.currentPassword;
        }

        // Check if the email is being updated and if it's already in use by another user
        if (updateData.email && updateData.email !== user.email) {
            const emailExists = await User.findOne({
                email: updateData.email,
                _id: { $ne: user._id } // Exclude current user from the check
            });
            if (emailExists) {
                return res.status(400).json({ message: 'Email already in use by another user.' });
            }
        }

        // Check if the phone is being updated and if it's already in use by another user
        if (updateData.phone && updateData.phone !== user.phone) {
            // Normalize the phone number
            const normalizedPhone = normalizeToE164(updateData.phone);

            if (!normalizedPhone) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Invalid phone number format'
                });
            }
            const phoneExists = await User.findOne({
                phone: normalizedPhone,
                _id: { $ne: user._id } // Exclude current user from the check
            });
            if (phoneExists) {
                return res.status(400).json({ message: 'Phone already in use by another user.' });
            }
        }

        // Check if the username is being updated and if it's already in use by another user
        if (updateData.username && updateData.username !== user.username) {
            const usernameExists = await User.findOne({
                username: updateData.username,
                _id: { $ne: user._id } // Exclude current user from the check
            });
            if (usernameExists) {
                return res.status(400).json({ message: 'Username already in use by another user.' });
            }
        }

        // Prevent role modification unless admin
        if ('role' in req.body && req.body.role && (!req.user || req.user.role !== 'admin')) {
            return res.status(403).json({
                status: 'error',
                message: 'Not authorized to modify user role',
            });
        }

        // Apply the updates
        Object.assign(user, updateData);

        // If a password is being updated (though not in the current validation schema),
        // it would be hashed by the pre-save hook in the User model.
        await user.save();

        // Re-fetch the user to return a clean object without the password field
        user = await User.findById(id).select('-password -__v');

        res.json({
            status: 'success',
            message: 'User updated successfully',
            data: {
                user,
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: 'error',
            message: 'Server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

