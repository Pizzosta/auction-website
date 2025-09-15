import User from '../models/User.js';
import { getCloudinary } from '../config/cloudinary.js';
import { normalizeToE164 } from '../utils/format.js';
import logger from '../utils/logger.js';

// @desc    Get all users (admin only)
// @route   GET /api/users
// @access  Private/Admin
export const getAllUsers = async (req, res) => {
  try {
    // Get pagination parameters (already validated by middleware)
    const {
      role,
      isVerified,
      rating,
      search,
      page = 1,
      limit = 10,
      sort = 'createdAt:desc',
      showDeleted = false,
    } = req.query;

    // Only admins can see soft-deleted users
    if (showDeleted && req.user.role !== 'admin') {
      return res.status(403).json({
        status: 'error',
        message: 'Only admins can view deleted users',
      });
    }

    // Parse pagination parameters
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(Math.max(1, parseInt(limit)), 100); // Cap at 100
    const skip = (pageNum - 1) * limitNum;

    // Build sort object if sort parameter is provided
    const [field, order] = sort.split(':');
    const sortOptions = {
      [field]: order === 'desc' ? -1 : 1,
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

    // Filter by rating if provided
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
        { username: searchRegex },
      ];
    }

    // Handle soft-deleted users in the query
    if (showDeleted) {
      // When showing deleted users, don't filter by isDeleted (show all)
      query.includeSoftDeleted = true;
    } else {
      // When not showing deleted users, only show active ones
      query.isDeleted = false;
    }

    // Execute query with pagination and sorting
    const users = await User.find(query)
      .select('-password -__v')
      .sort(sortOptions)
      .limit(limitNum)
      .skip(skip)
      .lean();

    // Get counts for both active and soft-deleted users
    const [activeCount, deletedCount] = await Promise.all([
      User.countDocuments({ ...query, isDeleted: false }),
      User.countDocuments({ ...query, isDeleted: true }),
    ]);

    const totalCount = activeCount + deletedCount;
    const totalPages = Math.ceil((showDeleted ? totalCount : activeCount) / limitNum);

    res.status(200).json({
      status: 'success',
      pagination: {
        currentPage: pageNum,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
      stats: {
        total: totalCount,
        active: activeCount,
        deleted: deletedCount,
      },
      data: {
        users,
      },
    });
  } catch (error) {
    logger.error('Get all users error:', {
      error: error.message,
      stack: error.stack,
      query: req.query,
    });

    res.status(500).json({
      status: 'error',
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};