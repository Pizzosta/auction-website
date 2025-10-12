import prisma from '../config/prisma.js';

/**
 * Creates a Prisma select object based on requested fields
 * @param {Array<string>} [fields] - Array of field names to include
 * @returns {Object} Prisma select object
 */
export const createUserSelect = (fields) => {
  if (!fields || !Array.isArray(fields) || fields.length === 0) {
    // Default fields if none specified
    return {
      id: true,
      firstname: true,
      lastname: true,
      middlename: true,
      email: true,
      username: true,
      role: true,
      isVerified: true,
      profilePicture: true,
      createdAt: true,
      updatedAt: true,
      version: true,
      deletedAt: true,
      isDeleted: true,
    };
  }

  // Create select object with requested fields
  return fields.reduce((select, field) => {
    select[field] = true;
    return select;
  }, {});
};

/**
 * Get user by ID with field selection
 * @param {string} id - User ID
 * @param {Array<string>} [fields] - Optional fields to include
 * @returns {Promise<Object|null>} User object or null if not found
 */
export const getUserByIdPrisma = async (id, fields) => {
  const select = createUserSelect(fields);

  const user = await prisma.user.findUnique({
    where: { id },
    select,
  });

  if (!user) return null;
  return user;
};

/**
 * Find user by email
 * @param {string} email - User email
 * @param {Array<string>} [fields] - Optional fields to include
 * @returns {Promise<Object|null>} User object or null if not found
 */
export const findUserByEmailPrisma = async (email, fields) => {
  if (!email) return null;

  const select = createUserSelect(fields);

  return prisma.user.findUnique({
    where: { email },
    select,
  });
};

/**
 * Find user by username
 * @param {string} username - Username
 * @param {Array<string>} [fields] - Optional fields to include
 * @returns {Promise<Object|null>} User object or null if not found
 */
export const findUserByUsernamePrisma = async (username, fields) => {
  if (!username) return null;

  const select = createUserSelect(fields);

  return prisma.user.findUnique({
    where: { username },
    select,
  });
};

/**
 * Find user by phone
 * @param {string} phone - User phone
 * @param {Array<string>} [fields] - Optional fields to include
 * @returns {Promise<Object|null>} User object or null if not found
 */
export const findUserByPhonePrisma = async (phone, fields) => {
  if (!phone) return null;

  const select = createUserSelect(fields);

  return prisma.user.findUnique({
    where: { phone },
    select,
  });
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

/*
/**
 * Permanently delete a user and all related data in a transaction
 * @param {string} userId - ID of the user to delete
 * @returns {Promise<Object>} Result of the transaction
 *
 * 
export const hardDeleteUserWithRelatedDataPrisma = async (userId) => {
  return await prisma.$transaction(async (tx) => {
    // Delete in correct order to respect foreign key constraints
    await tx.feedback.deleteMany({
      where: {
        OR: [
          { fromUserId: userId },
          { toUserId: userId }
        ]
      }
    });

    await tx.watchlist.deleteMany({
      where: { userId }
    });

    await tx.featuredAuction.deleteMany({
      where: { addedById: userId }
    });

    await tx.bid.deleteMany({
      where: { bidderId: userId }
    });

    await tx.auction.deleteMany({
      where: { 
        OR: [
          { sellerId: userId },
          { winnerId: userId }
        ]
      }
    });

    // Finally delete the user
    return await tx.user.delete({
      where: { id: userId }
    });
  });
};
*/

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
 * @returns {Promise<Object>} Updated user object
 */
export const updateUserDataPrisma = async (userId, data, fields) => {
  const select = createUserSelect(fields);

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
 * Get user by ID with version check
 * @param {string} userId - User ID
 * @param {Array<string>} [fields] - Optional fields to include
 * @returns {Promise<Object|null>} User object or null if not found
 */
export const getUserWithVersionPrisma = async (userId, fields) => {
  const select = createUserSelect(fields);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      ...select,
      version: true,
    },
  });

  if (!user) return null;
  return user;
};

/**
 * List users with pagination and filtering
 * @param {Object} options - Query options
 * @param {string} [options.role] - Filter by role
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
 * @returns {Promise<Object>} Object containing users and pagination info
 */
export async function listUsersPrisma({
  page = 1,
  limit = 10,
  sort = 'createdAt:desc',
  status,
  search = '',
  role = '',
  isVerified,
  rating,
  lastActiveAfter,
  lastActiveBefore,
  fields,
}) {
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

  // Sort mapping
  let [field, order] = String(sort).split(':');
  if (!field) field = 'createdAt';
  const allowed = new Set(['firstname', 'lastname', 'email', 'phone', 'username', 'createdAt']);
  if (!allowed.has(field)) field = 'createdAt';
  const orderBy = { [field]: order === 'asc' ? 'asc' : 'desc' };

  // Build select object based on requested fields
  const select = createUserSelect(fields);

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
