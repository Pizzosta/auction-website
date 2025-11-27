import prisma from '../config/prisma.js';
import logger from '../utils/logger.js';

/**
 * Creates a Prisma select object based on requested fields with security restrictions
 * @param {Array<string>} [fields] - Array of field names to include
 * @param {Object} [options] - Options for field selection
 * @param {boolean} [options.allowSensitive] - Whether to allow sensitive fields (admin only)
 * @returns {Object} Prisma select object
 */
export const createUserSelect = (fields, options = {}) => {
  const { allowSensitive = false } = options;

  // Define sensitive fields that should never be exposed
  const SENSITIVE_FIELDS = [
    'passwordHash',
    'resetPasswordToken',
    'resetPasswordExpire',
    'emailVerificationToken',
    'emailVerificationExpire',
  ];

  if (!fields || !Array.isArray(fields) || fields.length === 0) {
    // Default fields - explicitly exclude sensitive data
    return {
      id: true,
      firstname: true,
      middlename: true,
      lastname: true,
      email: true,
      phone: true,
      username: true,
      role: true,
      isVerified: true,
      profilePicture: true,
      createdAt: true,
      updatedAt: true,
      bio: true,
      location: true,
      rating: true,
      ratingCount: true,
      lastActiveAt: true,
      isDeleted: true,
      deletedAt: true,
      deletedById: true,
      version: true
    };
  }

  // Filter out sensitive fields unless explicitly allowed
  const safeFields = allowSensitive
    ? fields
    : fields.filter(field => !SENSITIVE_FIELDS.includes(field));

  // Log attempted access to sensitive fields for security monitoring
  if (!allowSensitive && fields.some(field => SENSITIVE_FIELDS.includes(field))) {
    logger.warn('Attempted to access sensitive user fields', {
      requestedFields: fields,
      allowedFields: safeFields,
      sensitiveFieldsAttempted: fields.filter(field => SENSITIVE_FIELDS.includes(field)),
      timestamp: new Date().toISOString()
    });
  }

  // Create select object with safe fields
  return safeFields.reduce((select, field) => {
    select[field] = true;
    return select;
  }, {});
};

/**
 * Find user by ID with field selection
 * @param {string} id - User ID
 * @param {Array<string>} [fields] - Optional fields to include
 * @param {Object} [options] - Options for field selection
 * @param {boolean} [options.allowSensitive] - Whether to allow sensitive fields
 * @returns {Promise<Object|null>} User object or null if not found
 */
export const findUserByIdPrisma = async (id, fields, options = {}) => {
  if (!id) return null;

  const select = createUserSelect(fields, options);

  return prisma.user.findUnique({
    where: { id },
    select,
  });
};

/**
 * Find user by email with field selection
 * @param {string} email - User email
 * @param {Array<string>} [fields] - Optional fields to include
 * @param {Object} [options] - Options for field selection
 * @param {boolean} [options.allowSensitive] - Whether to allow sensitive fields
 * @returns {Promise<Object|null>} User object or null if not found
 */
export const findUserByEmailPrisma = async (email, fields, options = {}) => {
  if (!email) return null;

  const select = createUserSelect(fields, options);

  return prisma.user.findUnique({
    where: { email },
    select,
  });
};

/**
 * Find user by username with field selection
 * @param {string} username - Username
 * @param {Array<string>} [fields] - Optional fields to include
 * @param {Object} [options] - Options for field selection
 * @param {boolean} [options.allowSensitive] - Whether to allow sensitive fields
 * @returns {Promise<Object|null>} User object or null if not found
 */
export const findUserByUsernamePrisma = async (username, fields, options = {}) => {
  if (!username) return null;

  const select = createUserSelect(fields, options);

  return prisma.user.findUnique({
    where: { username },
    select,
  });
};

/**
 * Find user by phone number with field selection
 * @param {string} phone - Phone number
 * @param {Array<string>} [fields] - Optional fields to include
 * @param {Object} [options] - Options for field selection
 * @param {boolean} [options.allowSensitive] - Whether to allow sensitive fields
 * @returns {Promise<Object|null>} User object or null if not found
 */
export const findUserByPhonePrisma = async (phone, fields, options = {}) => {
  if (!phone) return null;

  const select = createUserSelect(fields, options);

  return prisma.user.findUnique({
    where: { phone },
    select,
  });
};

/**
 * Check if a user can be permanently deleted
 * @param {string} userId - ID of the user to check
 * @returns {Promise<{canDelete: boolean, reason?: string}>} Object with canDelete status and optional reason
 */
export const canDeleteUserPrisma = async (userId) => {
  // Check if user has any active auctions
  const activeAuctions = await prisma.auction.count({
    where: {
      sellerId: userId,
      status: {
        in: ['active']
      },
      isDeleted: false
    }
  });

  if (activeAuctions > 0) {
    return {
      canDelete: false,
      reason: `You have ${activeAuctions} active auction${activeAuctions === 1 ? '' : 's'
        }. Please let ${activeAuctions === 1 ? 'it' : 'them'} end before deleting your account.`,
    };
  }

  // Check if user has any upcoming auctions
  const upcomingAuctions = await prisma.auction.count({
    where: {
      sellerId: userId,
      status: {
        in: ['upcoming']
      },
      isDeleted: false
    }
  });

  if (upcomingAuctions > 0) {
    return {
      canDelete: false,
      reason: `You have ${upcomingAuctions} upcoming auction${upcomingAuctions === 1 ? '' : 's'
        }. Please cancel ${upcomingAuctions === 1 ? 'it' : 'them'} before deleting your account.`,
    };
  }

  // Check if user is the highest bidder in any active auction
  const highestBidAuctions = await prisma.auction.count({
    where: {
      status: 'active',
      isDeleted: false,
      highestBid: {
        bidderId: userId
      }
    }
  });

  if (highestBidAuctions > 0) {
    return {
      canDelete: false,
      reason: `You are the highest bidder in ${highestBidAuctions} active auction${highestBidAuctions === 1 ? '' : 's'
        }. Please complete the auction or cancel ${highestBidAuctions === 1 ? 'it' : 'them'} before deleting your account.`
    };
  }

  // Check for incomplete won auctions where user is the buyer (sold but not completed)
  const incompleteWonAuctions = await prisma.auction.count({
    where: {
      winnerId: userId,
      status: 'sold',
      OR: [
        { isPaymentConfirmed: false },
        { isDeliveryConfirmed: false }
      ],
      isDeleted: false
    }
  });

  if (incompleteWonAuctions > 0) {
    return {
      canDelete: false,
      reason: `You have ${incompleteWonAuctions} won auction${incompleteWonAuctions === 1 ? '' : 's'} that ${incompleteWonAuctions === 1 ? 'has' : 'have'} not been completed. ` +
        `Please complete the payment and delivery process before deleting your account.`
    };
  }

  // Check for incomplete sold auctions where user is the seller
  const incompleteSoldAuctions = await prisma.auction.count({
    where: {
      sellerId: userId,
      status: 'sold',
      OR: [
        { isPaymentConfirmed: false },
        { isDeliveryConfirmed: false }
      ],
      isDeleted: false
    }
  });

  if (incompleteSoldAuctions > 0) {
    return {
      canDelete: false,
      reason: `You have ${incompleteSoldAuctions} sold auction${incompleteSoldAuctions === 1 ? '' : 's'} that ${incompleteSoldAuctions === 1 ? 'has' : 'have'} not been completed. ` +
        `Please ensure all payment and delivery processes are complete before deleting your account.`
    };
  }

  return { canDelete: true };
};

/**
 * Soft delete a user
 * @param {string} userId - ID of the user to soft delete
 * @param {string} deletedById - ID of the user performing the deletion
 * @param {number} version - Current version for optimistic concurrency control
 * @returns {Promise<Object>} Updated user object
 */
export const softDeleteUserPrisma = async (userId, deletedById, version) => {
  return await prisma.$transaction(async (tx) => {

    // Soft delete user's active auctions
    await tx.auction.updateMany({
      where: {
        sellerId: userId,
        isDeleted: false
      },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedById: deletedById,
        version: { increment: 1 },
      }
    });

    // Soft delete user's active bids
    await tx.bid.updateMany({
      where: {
        bidderId: userId,
        isDeleted: false
      },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedById: deletedById,
        version: { increment: 1 },
      }
    });

    // Soft delete user's watchlist
    await tx.watchlist.updateMany({
      where: {
        userId,
        isDeleted: false
      },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedById: deletedById,
        version: { increment: 1 },
      }
    });

    // Soft delete user
    return await tx.user.update({
      where: { id: userId, version },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedById: deletedById,
        version: { increment: 1 },
      },
    });
  });
};

/**
 * Permanently delete a user using database cascades
 * @param {string} userId - ID of the user to delete
 * @returns {Promise<Object>} Result of the deletion
 */
export const hardDeleteUserWithRelatedDataPrisma = async (userId) => {
  return await prisma.user.delete({
    where: { id: userId }
  });
};

/**
 * Restore a soft-deleted user and all related data in a transaction
 * @param {string} userId - ID of the user to restore
 * @returns {Promise<Object>} Updated user object
 */
export const restoreUserPrisma = async (userId) => {
  return await prisma.$transaction(async (tx) => {
    // Restore user first
    const user = await tx.user.update({
      where: {
        id: userId,
        isDeleted: true // Only restore if currently soft-deleted
      },
      data: {
        isDeleted: false,
        deletedAt: null,
        deletedById: null,
        version: { increment: 1 },
      },
    });

    // Restore user's soft-deleted auctions
    await tx.auction.updateMany({
      where: {
        sellerId: userId,
        isDeleted: true,
        deletedById: userId, // Only restore what was deleted by this user not by admin
      },
      data: {
        isDeleted: false,
        deletedAt: null,
        deletedById: null,
        version: { increment: 1 },
      },
    });

    // Restore user's soft-deleted bids
    await tx.bid.updateMany({
      where: {
        bidderId: userId,
        isDeleted: true,
        deletedById: userId, // Only restore what was deleted by this user not by admin
      },
      data: {
        isDeleted: false,
        deletedAt: null,
        deletedById: null,
        version: { increment: 1 },
      },
    });

    // Restore user's soft-deleted watchlist
    await tx.watchlist.updateMany({
      where: {
        userId,
        isDeleted: true,
        deletedById: userId, // Only restore what was deleted by this user not by admin
      },
      data: {
        isDeleted: false,
        deletedAt: null,
        deletedById: null,
        version: { increment: 1 },
      },
    });

    return user;
  });
};

/**
 * Update user's profile picture
 * @param {string} userId - ID of the user
 * @param {string} profilePicture - URL of the new profile picture
 * @returns {Promise<Object>} Updated user object
 */
export const updateUserProfilePicturePrisma = async (userId, profilePicture) => {
  return prisma.user.update({
    where: { id: userId },
    data: { profilePicture },
    select: {
      id: true,
      profilePicture: true,
      updatedAt: true,
    },
  });
};

/**
 * Remove user's profile picture
 * @param {string} userId - ID of the user
 * @returns {Promise<Object>} Updated user object
 */
export const removeUserProfilePicturePrisma = async (userId) => {
  return prisma.user.update({
    where: { id: userId },
    data: { profilePicture: null },
    select: {
      id: true,
      profilePicture: true,
      updatedAt: true,
    },
  });
};

/**
 * Update user data
 * @param {string} userId - ID of the user to update
 * @param {Object} data - Data to update
 * @param {Array<string>} [fields] - Fields to return
 * @param {Object} [options] - Options for field selection
 * @param {boolean} [options.allowSensitive] - Whether to allow sensitive fields
 * @returns {Promise<Object>} Updated user object
 */
export const updateUserDataPrisma = async (userId, data, fields, options = {}) => {
  const select = createUserSelect(fields, options);

  return prisma.user.update({
    where: { id: userId },
    data,
    select: {
      ...select,
      version: true, // Always include version for optimistic concurrency
    },
  });
};

/**
 * List users with pagination and filtering
 * @param {Object} options - Query options
 * @param {number} [options.page=1] - Page number
 * @param {number} [options.limit=10] - Items per page
 * @param {string} [options.search=''] - Search term
 * @param {string} [options.sort='createdAt:desc'] - Sort field and order
 * @param {string} [options.role] - Filter by role ('user, 'admin')
 * @param {boolean} [options.isVerified] - Filter by verification status
 * @param {number} [options.rating] - Filter by minimum rating
 * @param {string} [options.search] - Search term
 * @param {number} [options.page=1] - Page number
 * @param {number} [options.limit=10] - Items per page
 * @param {string} [options.sort='createdAt:desc'] - Sort field and direction
 * @param {string} [options.status] - Filter by status ('active', 'deleted', 'all')
 * @param {string} [options.lastActiveAfter] - Filter by last active after date
 * @param {string} [options.lastActiveBefore] - Filter by last active before date
 * @param {Array<string>} [options.fields] - Fields to include
 * @param {boolean} [options.allowSensitive] - Whether to allow sensitive fields
 * @returns {Promise<Object>} Paginated users and pagination info
 */
export const listUsersPrisma = async ({
  page = 1,
  limit = 10,
  search = '',
  sort = 'createdAt',
  order = 'desc',
  status,
  role,
  isVerified,
  rating,
  lastActiveAfter,
  lastActiveBefore,
  fields,
  allowSensitive = false,
}) => {
  // Build select object based on requested fields
  const select = createUserSelect(fields, { allowSensitive });

  const pageNum = Math.max(1, parseInt(page));
  const take = Math.min(Math.max(1, parseInt(limit)), 100);
  const skip = (pageNum - 1) * take;

  // Build where filter
  const where = {};

  // Handle status filter (case-insensitive via normalization)
  if (status) {
    const normalizedStatus = status.toLowerCase();

    if (normalizedStatus === 'active') {
      where.isDeleted = { not: true };
    } else if (normalizedStatus === 'deleted') {
      where.isDeleted = true;
    } else if (normalizedStatus === 'all') {
      // no filter
    } else {
      // fallback for unknown status strings
      where.status = normalizedStatus;
    }
  }

  if (role) where.role = role;
  if (typeof isVerified !== 'undefined') where.isVerified = isVerified === 'true' || isVerified === true;
  if (typeof rating !== 'undefined') where.rating = Number(rating);

  // Handle lastActiveAt filters
  if (lastActiveAfter || lastActiveBefore) {
    where.lastActiveAt = {};

    if (lastActiveAfter) {
      where.lastActiveAt.gte = new Date(lastActiveAfter);
    }

    if (lastActiveBefore) {
      where.lastActiveAt.lte = new Date(lastActiveBefore);
    }
  }

  if (search) {
    const s = String(search);
    where.OR = [
      { firstname: { contains: s, mode: 'insensitive' } },
      { lastname: { contains: s, mode: 'insensitive' } },
      { email: { contains: s, mode: 'insensitive' } },
      { phone: { contains: s, mode: 'insensitive' } },
      { username: { contains: s, mode: 'insensitive' } },
    ];
  }

  // Sort 
  const allowedSortFields = new Set(['firstname', 'lastname', 'email', 'phone', 'username', 'createdAt']);

  // Validate and set default sort field
  const field = allowedSortFields.has(sort) ? sort : 'createdAt';

  // Validate and set default order direction
  const orderDirection = order === 'asc' ? 'asc' : 'desc';

  const orderBy = { [field]: orderDirection };


  const [count, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy,
      skip,
      take,
      select
    }),
  ]);

  const shaped = users.map(u => ({
    ...u,
    profilePicture: u.profilePicture || null
  }));

  const totalPages = Math.ceil(count / take) || 1;

  return {
    data: shaped,
    pagination: {
      currentPage: pageNum,
      totalItems: count,
      totalPages,
      itemsPerPage: take,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1,
    },
  };
}
