import prisma from '../config/prisma.js';

/**
 * Get auction with related data for feedback
 * @param {string} auctionId - Auction ID
 * @returns {Promise<Object|null>} Auction with related data or null if not found
 */
export async function getAuctionForFeedback(auctionId) {
    return prisma.auction.findUnique({
        where: { id: auctionId, isDeleted: false },
        include: {
            seller: true,
            highestBid: {
                include: {
                    bidder: true,
                },
            },
        },
    });
}

/**
 * Check if feedback already exists for the given auction and user
 * @param {string} auctionId - Auction ID
 * @param {string} fromUserId - User ID leaving feedback
 * @param {string} type - Feedback type ('seller' or 'buyer')
 * @returns {Promise<Object|null>} Existing feedback or null if not found
 */
export async function getExistingFeedback(auctionId, fromUserId, type) {
    return prisma.feedback.findUnique({
        where: {
            auctionId_fromUserId_type: {
                auctionId,
                fromUserId,
                type,
            },
        },
    });
}

/**
 * Update user's average rating
 * @param {string} userId - User ID to update rating for
 * @returns {Promise<void>}
 */
export async function updateUserRating(userId) {
    const result = await prisma.feedback.aggregate({
        where: { toUserId: userId },
        _avg: { rating: true },
        _count: true,
    });

    await prisma.user.update({
        where: { id: userId },
        data: {
            rating: result._avg.rating,
            ratingCount: result._count,
        },
    });
}

/**
 * List feedback with pagination and filtering
 * @param {Object} options - Query options
 * @param {string} options.userId - User ID to filter feedback for
 * @param {string} [options.type] - Feedback type ('seller' or 'buyer')
 * @param {number} [options.page=1] - Page number
 * @param {number} [options.limit=10] - Items per page
 * @returns {Promise<Object>} - Object containing feedback items and pagination info
 */
export async function listFeedbackPrisma({
    userId,
    fromUserId,
    type,
    page = 1,
    limit = 10,
    sort = 'createdAt',
    order = 'desc',
    minRating,
    maxRating,
    startDate,
    endDate,
    fields
}) {
    const pageNum = Math.max(1, parseInt(page));
    const take = Math.min(Math.max(1, parseInt(limit)), 100);
    const skip = (pageNum - 1) * take;

    // Build where clause
    const where = {};
    if (userId) where.toUserId = userId;  // For received feedback
    if (fromUserId) where.fromUserId = fromUserId;  // For sent feedback

    if (type && ['seller', 'buyer'].includes(type)) {
        where.type = type;
    }

    if (minRating !== undefined) {
        where.rating = { gte: parseInt(minRating) };
    }

    if (maxRating !== undefined) {
        where.rating = { ...where.rating, lte: parseInt(maxRating) };
    }

    if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate) where.createdAt.lte = new Date(endDate);
    }

    // Sort configuration
    const allowedSortFields = new Set([
        'rating',
        'createdAt',
        'updatedAt'
    ]);
    
    // Validate and set default sort field
    const sortField = allowedSortFields.has(sort) ? sort : 'createdAt';
    
    // Validate and set default order direction
    const orderDirection = order === 'asc' ? 'asc' : 'desc';
    
    const orderBy = { [sortField]: orderDirection };

    // Build select object for fields
    const select = {
        fromUser: {
            select: {
                id: true,
                username: true,
                profilePicture: true,
            },
        },
        auction: {
            select: {
                id: true,
                title: true,
                images: true,
            },
        },
        id: true,
        rating: true,
        comment: true,
        type: true,
        isAnonymous: true,
        response: true,
        createdAt: true,
        updatedAt: true,
    };

    // If specific fields are requested, filter the select object
    if (fields && Array.isArray(fields)) {
        const fieldSet = new Set(fields);
        const filteredSelect = {};

        Object.entries(select).forEach(([key, value]) => {
            if (fieldSet.has(key) || key === 'id') { // Always include id
                filteredSelect[key] = value;
            }
        });

        // Special handling for nested fields
        if (fieldSet.has('fromUser')) {
            filteredSelect.fromUser = select.fromUser;
        }
        if (fieldSet.has('auction')) {
            filteredSelect.auction = select.auction;
        }

        Object.assign(select, filteredSelect);
    }

    const [feedbacks, count] = await Promise.all([
        prisma.feedback.findMany({
            where,
            include: {
                fromUser: {
                    select: {
                        id: true,
                        username: true,
                        profilePicture: true,
                        isDeleted: true
                    }
                },
                auction: {
                    select: {
                        id: true,
                        title: true,
                        images: true
                    }
                }
            },
            orderBy,
            skip,
            take,
        }),
        prisma.feedback.count({ where }),
    ]);

    const totalPages = Math.ceil(count / take);

    return {
        data: feedbacks,
        pagination: {
            currentPage: pageNum,
            totalFeedbacks: count,
            totalPages,
            limit: take,
            hasNext: pageNum < totalPages,
            hasPrev: pageNum > 1,
        },
    };

}

/**
 * Get feedback summary for a user
 * @param {string} userId - User ID to get summary for
 * @returns {Promise<Object>} - Object containing feedback statistics
 */
export async function getFeedbackSummaryPrisma(userId) {
    const [sellerFeedback, buyerFeedback] = await Promise.all([
        prisma.feedback.groupBy({
            by: ['rating'],
            where: {
                toUserId: userId,
                type: 'seller',
            },
            _count: {
                rating: true,
            },
        }),
        prisma.feedback.groupBy({
            by: ['rating'],
            where: {
                toUserId: userId,
                type: 'buyer',
            },
            _count: {
                rating: true,
            },
        }),
    ]);

    const calculateStats = (feedback) => {
        const total = feedback.reduce((sum, item) => sum + item._count.rating, 0);
        const average =
            feedback.length > 0
                ? feedback.reduce((sum, item) => sum + item.rating * item._count.rating, 0) / total
                : 0;

        const distribution = Array(5)
            .fill(0)
            .map((_, i) => {
                const rating = 5 - i;
                const count = feedback.find((f) => f.rating === rating)?._count.rating || 0;
                return { rating, count, percentage: total > 0 ? Math.round((count / total) * 100) : 0 };
            });

        return { total, average, distribution };
    };

    return {
        seller: calculateStats(sellerFeedback),
        buyer: calculateStats(buyerFeedback),
    };
}

/**
 * Create a new feedback
 * @param {Object} data - Feedback data
 * @returns {Promise<Object>} - Created feedback
 */
export async function createFeedbackPrisma(data) {
    return prisma.feedback.create({
        data,
        include: {
            fromUser: {
                select: {
                    id: true,
                    username: true,
                    profilePicture: true,
                },
            },
            auction: {
                select: {
                    id: true,
                    title: true,
                },
            },
        },
    });
}

/**
 * Respond to feedback
 * @param {string} feedbackId - Feedback ID to respond to
 * @param {string} response - Response text
 * @returns {Promise<Object>} - Updated feedback
 */
export async function respondToFeedbackPrisma(feedbackId, response) {
    return prisma.feedback.update({
        where: { id: feedbackId },
        data: { response },
        include: {
            fromUser: {
                select: {
                    id: true,
                    username: true,
                    profilePicture: true,
                },
            },
        },
    });
}

/**
 * Get feedback by ID
 * @param {string} feedbackId - Feedback ID
 * @returns {Promise<Object|null>} - Feedback or null if not found
 */
export async function getFeedbackByIdPrisma(feedbackId) {
    return prisma.feedback.findUnique({
        where: { id: feedbackId },
        include: {
            auction: true,
            toUser: true,
        },
    });
}

/**
 * Get user's average rating
 * @param {string} userId - User ID
 * @returns {Promise<number>} - Average rating
 */
export async function getUserAverageRatingPrisma(userId) {
    const result = await prisma.feedback.aggregate({
        where: { toUserId: userId },
        _avg: { rating: true },
        _count: true,
    });

    return {
        average: result._avg.rating || 0,
        count: result._count,
    };
}
