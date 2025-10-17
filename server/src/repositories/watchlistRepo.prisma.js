import prisma from '../config/prisma.js';

/**
 * Check if auction exists and is active
 * @param {string} auctionId - Auction ID
 * @returns {Promise<Object|null>} Auction or null if not found
 */
export const findAuction = async (auctionId) => {
  return prisma.auction.findUnique({
    where: {
      id: auctionId,
      isDeleted: false
    },
  });
};

/**
 * Find watchlist item by user and auction
 * @param {string} userId - User ID
 * @param {string} auctionId - Auction ID
 * @param {Object} [options] - Query options
 * @param {boolean} [options.includeDeleted] - Whether to include soft-deleted entries
 * @returns {Promise<Object|null>} Watchlist item or null if not found
 */
export const findWatchlist = async (userId, auctionId, options = {}) => {
  const { includeDeleted = false } = options;

  return prisma.watchlist.findFirst({
    where: {
      userId,
      auctionId,
      ...(!includeDeleted && { isDeleted: false }),
    },
  });
};

/**
 * Create new watchlist entry
 * @param {string} userId - User ID
 * @param {string} auctionId - Auction ID
 * @returns {Promise<Object>} Created watchlist entry
 */
export const createWatchlist = async (userId, auctionId) => {
  return prisma.watchlist.create({
    data: {
      userId,
      auctionId
    },
    select: {
      id: true,
      createdAt: true,
      auction: {
        select: {
          id: true,
          title: true
        }
      }
    }
  });
};

/**
 * Restore soft-deleted watchlist item
 * @param {string} id - Watchlist entry ID
 * @returns {Promise<Object>} Restored watchlist entry
 */
export const restoreWatchlist = async (id) => {
  return prisma.watchlist.update({
    where: { id, isDeleted: true },
    data: {
      isDeleted: false,
      deletedAt: null,
      deletedById: null,
      version: { increment: 1 },
    },
  });
};

/**
 * Soft delete watchlist item
 * @param {string} id - Watchlist entry ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Soft-deleted watchlist entry
 */
export const softDeleteWatchlist = async (id, userId) => {
  return prisma.watchlist.update({
    where: { id, userId, isDeleted: false },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
      deletedById: userId,
      version: { increment: 1 },
    }
  });
};

/**
 * Get paginated watchlist for user
 * @param {string} userId - User ID
 * @param {Object} [options] - Query options
 * @param {number} [options.page=1] - Page number
 * @param {number} [options.limit=10] - Items per page
 * @param {boolean} [options.includeDeleted=false] - Whether to include soft-deleted entries
 * @param {boolean} [options.includeAuction=true] - Whether to include auction data
 * @param {Object} [options.filters] - Additional filters
 * @returns {Promise<Object>} Paginated watchlist entries
 */
export const getUserWatchlist = async (userId, options = {}) => {
  const {
    page = 1,
    limit = 10,
    includeDeleted = false,
    includeAuction = true,
    status,
    sort = 'newest'
  } = options;

  const pageNum = Math.max(1, parseInt(page));
  const take = Math.min(Math.max(1, parseInt(limit)), 100); // Cap at 100 items
  const skip = (pageNum - 1) * take;

  // Build base where clause
  const where = {
    userId,
    ...(!includeDeleted && { isDeleted: false }), // exclude soft-deleted watchlist entries
    auction: {
      ...(!includeDeleted && { isDeleted: false }), // exclude soft-deleted auctions
      ...(status && { status: status.toLowerCase() }), // exclude soft-deleted auctions
    }
  };

  // Build sort options
  const orderBy = { createdAt: sort === 'oldest' ? 'asc' : 'desc' };

  const [count, items] = await Promise.all([
    prisma.watchlist.count({ where }),
    prisma.watchlist.findMany({
      where,
      include: {
        auction: includeAuction ? {
          select: {
            id: true,
            title: true,
            currentPrice: true,
            endDate: true,
            status: true,
            images: true,
            seller: {
              select: {
                id: true,
                username: true
              }
            }
          }
        } : false
      },
      skip,
      take,
      orderBy
    })
  ]);

  const totalPages = Math.ceil(count / take) || 1;

  return {
    data: items,
    pagination: {
      currentPage: pageNum,
      totalItems: count,
      totalPages,
      itemsPerPage: take,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1,
    }
  };
};

/**
 * Check if auction is in user's watchlist
 * @param {string} userId - User ID
 * @param {string} auctionId - Auction ID
 * @param {Object} [options] - Query options
 * @param {boolean} [options.includeDeleted=false] - Whether to include soft-deleted entries
 * @returns {Promise<Object|null>} Watchlist item or null if not found
 */
export const checkWatchlist = async (userId, auctionId, options = {}) => {
  const { includeDeleted = false } = options;

  return prisma.watchlist.findFirst({
    where: {
      userId,
      auctionId,
      ...(!includeDeleted && { isDeleted: false }),
    },
    select: {
      id: true,
      createdAt: true,
      auction: {
        select: {
          id: true,
          title: true,
          currentPrice: true,
          endDate: true,
          status: true,
          images: true,
          seller: {
            select: {
              id: true,
              username: true
            }
          }
        }
      }
    }
  });
};