import prisma from '../config/prisma.js';

/**
 * Find a featured auction by ID with optional includes
 * @param {string} auctionId - The ID of the auction
 * @param {Object} [options] - Options
 * @param {boolean} [options.includeAuction] - Include auction details
 * @param {boolean} [options.includeAddedBy] - Include added by user details
 * @param {boolean} [options.includeDeletedBy] - Include deleted by user details
 * @returns {Promise<Object|null>} Featured auction or null if not found
 */
export const findFeaturedAuctionByIdPrisma = async (auctionId, options = {}) => {
    const { includeAuction = false, includeAddedBy = false, includeDeletedBy = false } = options;

    return prisma.featuredAuction.findUnique({
        where: { auctionId },
        include: {
            auction: includeAuction,
            addedBy: includeAddedBy ? { select: { id: true, username: true } } : false,
            deletedBy: includeDeletedBy ? { select: { id: true, username: true } } : false,
        },
    });
};

/**
 * Find all featured auctions with pagination and filtering
 * @param {Object} [options] - Query options
 * @param {number} [options.page=1] - Page number (1-based)
 * @param {number} [options.limit=10] - Items per page
 * @param {string} [options.sort='newest'] - Sort field and direction
 * @param {boolean} [options.includeDeleted=false] - Include soft-deleted items (admin only)
 * @param {boolean} [options.includeAuction=true] - Include auction details
 * @param {boolean} [options.includeAddedBy=true] - Include added by user details
 * @returns {Promise<{data: Array, total: number}>} Paginated results and total count
 */
export const findFeaturedAuctionsPrisma = async (options = {}) => {
    const {
        page = 1,
        limit = 10,
        sort = 'newest',
        status,
        includeAuction = true,
        includeAddedBy = true,
    } = options;

    const pageNum = Math.max(1, parseInt(page));
    const take = Math.min(Math.max(1, parseInt(limit)), 100);
    const skip = (pageNum - 1) * take;

    // Build where filter
    const where = {};

    // Handle status filter (case-insensitive via normalization)
    if (status) {
        const normalizedStatus = status.toLowerCase();
        if (normalizedStatus === 'active') {
            where.isDeleted = false;
        } else if (normalizedStatus === 'deleted') {
            where.isDeleted = true;
        } else if (normalizedStatus === 'all') {
            // no filter - include both deleted and non-deleted
        } else {
            // fallback for unknown status strings
            where.status = normalizedStatus;
        }
    } else {
        // Default behavior: only show active if no status specified
        where.isDeleted = false;
    }

    // Build sort options
    const orderBy = { createdAt: sort === 'oldest' ? 'asc' : 'desc' };

    const [count, items] = await Promise.all([
        prisma.featuredAuction.count({ where }),
        prisma.featuredAuction.findMany({
            where,
            include: {
                auction: includeAuction,
                addedBy: includeAddedBy ? { select: { id: true, username: true } } : false,
            },
            orderBy,
            skip,
            take,
        }),
    ]);

    const totalPages = Math.ceil(count / take) || 1;

    return {
        pagination: {
            currentPage: pageNum,
            totalItems: count,
            totalPages,
            itemsPerPage: take,
            hasNext: pageNum < totalPages,
            hasPrev: pageNum > 1,
        },
        data: items,
    };
};

/**
 * Add an auction to featured list
 * @param {string} auctionId - The ID of the auction to feature
 * @param {string} addedById - The ID of the user who is featuring the auction
 * @returns {Promise<Object>} The created featured auction
 */
export const createFeaturedAuctionPrisma = async (auctionId, addedById) => {
    return prisma.featuredAuction.create({
        data: {
            auctionId,
            addedById,
        },
    });
};

/**
 * Soft delete a featured auction
 * @param {string} auctionId - The ID of the auction to unfeature
 * @param {string} deletedById - The ID of the user performing the deletion
 * @returns {Promise<Object>} The updated featured auction
 */
export const softDeleteFeaturedAuctionPrisma = async (auctionId, deletedById) => {
    return prisma.featuredAuction.update({
        where: { auctionId },
        data: {
            isDeleted: true,
            deletedAt: new Date(),
            deletedById,
        },
    });
};

/**
 * Permanently delete a featured auction
 * @param {string} auctionId - The ID of the auction to remove
 * @returns {Promise<Object>} The deleted featured auction
 */
export const deleteFeaturedAuctionPrisma = async (auctionId) => {
    return prisma.featuredAuction.delete({
        where: { auctionId },
    });
};

/**
 * Restore a soft-deleted featured auction
 * @param {string} auctionId - The ID of the auction to restore
 * @returns {Promise<Object>} The restored featured auction
 */
export const restoreFeaturedAuctionPrisma = async (auctionId, restoredById) => {
    return prisma.featuredAuction.update({
        where: { auctionId },
        data: {
            isDeleted: false,
            deletedAt: null,
            deletedById: null,
            restoredAt: new Date(),
            restoredById,
        },
    });
};

