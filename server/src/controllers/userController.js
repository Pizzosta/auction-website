import User from '../models/User.js';

// @desc    Get all users (admin only)
// @route   GET /api/users
// @access  Private/Admin
export const getAllUsers = async (req, res) => {
    try {
        // Get pagination parameters (already validated by middleware)
        const { page = 1, limit = 10, sort } = req.query;
        const skip = (page - 1) * limit;
        
        // Build sort object if sort parameter is provided
        const sortOptions = {};
        if (sort) {
            const [field, order] = sort.split(':');
            sortOptions[field] = order === 'desc' ? -1 : 1;
        } else {
            // Default sort by creation date (newest first)
            sortOptions.createdAt = -1;
        }

        // Build query
        const query = {};

        // Filter by role if provided
        if (req.query.role) {
            query.role = req.query.role;
        }

        // Search by name, email, or username if search query is provided
        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search, 'i');
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
            .skip(skip)
            .limit(limit)
            .sort(sortOptions);

        // Get total count for pagination
        const total = await User.countDocuments(query);
        const pages = Math.ceil(total / limit);

        res.status(200).json({
            status: 'success',
            count: users.length,
            page,
            pages,
            total,
            data: {
                users
            }
        });
    } catch (error) {
        console.error('Get all users error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

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


// Update a user's information
export const updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        // Ensure the request body is not empty before proceeding
        if (!updateData || Object.keys(updateData).length === 0) {
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
            const emailExists = await User.findOne({ email: updateData.email });
            if (emailExists) {
                return res.status(400).json({ message: 'Email already in use' });
            }
        }

        // Check if the phone is being updated and if it's already in use by another user
        if (updateData.phone && updateData.phone !== user.phone) {
            const phoneExists = await User.findOne({ phone: updateData.phone });
            if (phoneExists) {
                return res.status(400).json({ message: 'Phone already in use' });
            }
        }

        // Check if the username is being updated and if it's already in use by another user
        if (updateData.username && updateData.username !== user.username) {
            const usernameExists = await User.findOne({ username: updateData.username });
            if (usernameExists) {
                return res.status(400).json({ message: 'Username already in use' });
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

