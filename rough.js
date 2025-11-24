import prisma from '../config/prisma.js';

/**
 * Get all bids with filtering and pagination
 */
export async function listAllBidsPrisma({
  page = 1,
  limit = 10,
  sort = 'createdAt:desc',
  status,
  auctionId,
  bidderId,
  minAmount,
  maxAmount,
  startDate,
  endDate,
}) {
  const pageNum = Math.max(1, parseInt(page));
  const take = Math.min(Math.max(1, parseInt(limit)), 100);
  const skip = (pageNum - 1) * take;

  // Build where filter
  const where = {};

  // Handle status filter
  if (status) {
    const normalizedStatus = status.toLowerCase();

    if (normalizedStatus === 'active') {
      // Show only bids that are not deleted
      where.isDeleted = false;
      where.auction = {
        status: 'active',
        endDate: { gt: new Date() },
      };
    } else if (normalizedStatus === 'won') {
      where.auction = {
        status: 'sold',
        winnerId: where.bidderId, // The bidder won this auction
      };
    } else if (normalizedStatus === 'lost') {
      where.AND = [
        {
          auction: {
            status: { in: ['ended', 'sold'] },
            NOT: { winnerId: where.bidderId }, // The bidder didn't win
          },
        },
      ];
    } else if (normalizedStatus === 'outbid') {
      // This requires additional logic to determine if a bid was outbid
      // You might need to add a field to track this
      where.isOutbid = true;
    } else if (normalizedStatus === 'cancelled') {
      where.isDeleted = true;
    } else if (normalizedStatus === 'all') {
      // no filter
    } else {
      // fallback for unknown status strings
      where.status = normalizedStatus;
    }
  }

  // ID filters
  if (auctionId) where.auctionId = auctionId;
  if (bidderId) where.bidderId = bidderId;

  // Amount range
  if (minAmount || maxAmount) {
    where.amount = {};
    if (minAmount) where.amount.gte = parseFloat(minAmount);
    if (maxAmount) where.amount.lte = parseFloat(maxAmount);
  }

  // Date range
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate);
    if (endDate) where.createdAt.lte = new Date(endDate);
  }

  // Sort
  let [sortField, sortOrder] = sort.split(':');
  sortOrder = sortOrder || 'desc';
  const orderBy = { [sortField]: sortOrder };

  const [count, bids] = await Promise.all([
    prisma.bid.count({ where }),
    prisma.bid.findMany({
      where,
      orderBy,
      skip,
      take,
      include: {
        bidder: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
        auction: {
          select: {
            id: true,
            title: true,
            currentPrice: true,
            endDate: true,
            status: true,
            winnerId: true,
          },
        },
      },
    }),
  ]);

  return {
    bids,
    count,
    pageNum,
    take,
  };
}

/**
 * List bids with filtering and pagination for a specific bidder
 */
export async function listBidsPrisma({
  bidderId,
  status,
  showDeleted = false,
  page = 1,
  limit = 10,
  sort = 'createdAt:desc',
}) {
  const pageNum = Math.max(1, parseInt(page));
  const take = Math.min(Math.max(1, parseInt(limit)), 100);
  const skip = (pageNum - 1) * take;

  // Build where filter
  const where = {};

  if (bidderId) where.bidderId = bidderId;

  // Handle status filter
  if (status) {
    const normalizedStatus = status.toLowerCase();

    if (normalizedStatus === 'active') {
      where.auction = {
        status: 'active',
        endDate: { gt: new Date() },
      };
    } else if (normalizedStatus === 'won') {
      where.auction = {
        status: 'sold',
        winnerId: bidderId,
      };
    } else if (normalizedStatus === 'lost') {
      where.NOT = {
        auction: {
          winnerId: bidderId,
        },
      };
      where.auction = {
        status: { in: ['ended', 'sold'] },
      };
    } else if (normalizedStatus === 'outbid') {
      where.isOutbid = true;
    } else if (normalizedStatus === 'cancelled') {
      where.isDeleted = true;
    } else if (normalizedStatus === 'all') {
      // no filter
    } else {
      // fallback for unknown status strings
      where.status = normalizedStatus;
    }
  }

  // Handle deleted items
  if (!showDeleted) {
    where.isDeleted = false;
  }

  // Sort
  let [field, order] = String(sort).split(':');
  if (!field) field = 'createdAt';
  const allowedSortFields = new Set(['amount', 'createdAt']);
  if (!allowedSortFields.has(field)) field = 'createdAt';
  const orderBy = { [field]: order === 'asc' ? 'asc' : 'desc' };

  // Execute queries
  const [count, bids] = await Promise.all([
    prisma.bid.count({ where }),
    prisma.bid.findMany({
      where,
      orderBy,
      skip,
      take,
      include: {
        auction: {
          select: {
            id: true,
            title: true,
            currentPrice: true,
            endDate: true,
            status: true,
            winnerId: true,
          },
        },
        bidder: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            email: true,
          },
        },
      },
    }),
  ]);

  return {
    bids,
    count,
    pageNum,
    take,
  };
}

/**
 * List bids for a specific auction
 */
export async function listBidsByAuctionPrisma({
  auctionId,
  status,
  page = 1,
  limit = 10,
  sort = 'amount:desc',
}) {
  const pageNum = Math.max(1, parseInt(page));
  const take = Math.min(Math.max(1, parseInt(limit)), 100);
  const skip = (pageNum - 1) * take;

  // Build where filter
  const where = { auctionId };

  // Handle status filter
  if (status) {
    const normalizedStatus = status.toLowerCase();

    if (normalizedStatus === 'cancelled') {
      // Show all bids that are cancelled (isDeleted=true), regardless of auction status
      where.isDeleted = true;
    } else if (normalizedStatus === 'all') {
      // no additional filters needed
    } else {
      // For other statuses, ensure we don't show deleted bids
      where.isDeleted = false;

      if (normalizedStatus === 'active') {
        // Show only bids that are not deleted
        where.isDeleted = false;
        where.auction = {
          status: 'active',
          endDate: { gt: new Date() },
        };
      } else if (normalizedStatus === 'won') {
        where.auction = {
          status: 'sold',
        };
      } else if (normalizedStatus === 'outbid') {
        where.isOutbid = true;
      }
    }
  } else {
    // Default behavior - don't show deleted bids
    where.isDeleted = false;
  }

  // Sort
  let [field, order] = String(sort).split(':');
  if (!field) field = 'amount';
  const allowedSortFields = new Set(['amount', 'createdAt']);
  if (!allowedSortFields.has(field)) field = 'amount';
  const orderBy = { [field]: order === 'asc' ? 'asc' : 'desc' };

  // Execute queries
  const [count, bids] = await Promise.all([
    prisma.bid.count({ where }),
    prisma.bid.findMany({
      where,
      orderBy,
      skip,
      take,
      include: {
        bidder: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            email: true,
          },
        },
      },
    }),
  ]);

  return {
    bids,
    count,
    pageNum,
    take,
  };
}









export async function listAllBidsPrisma({
  page = 1,
  limit = 10,
  sort = 'createdAt',
  order = 'desc',
  status,
  auctionId,
  bidderId,
  minAmount,
  maxAmount,
  startDate,
  endDate,
  fields,
  highestBidderOnly = false,    // ✅ New param
  winningBidsOnly = false       // ✅ New param
}) {
  const pageNum = Math.max(1, parseInt(page));
  const take = Math.min(Math.max(1, parseInt(limit)), 100);
  const skip = (pageNum - 1) * take;

  // Parse sort parameter
  const allowedSortFields = new Set(['createdAt', 'amount', 'updatedAt']);
  const sortField = allowedSortFields.has(sort) ? sort : 'createdAt';
  const orderDirection = order === 'asc' ? 'asc' : 'desc';

  // Start building the where clause
  const where = {
    isDeleted: false, // Default filter
  };

  if (auctionId) where.auctionId = auctionId;
  if (bidderId) where.bidderId = bidderId;

  // Handle status filter
  if (status) {
    const normalizedStatus = status.toLowerCase();
    
    if (normalizedStatus === 'active') {
      where.isDeleted = false;
      // This requires a join with auction table
      where.auction = {
        status: 'active',
        endDate: { gt: new Date() },
      };
    } else if (normalizedStatus === 'won') {
      where.isDeleted = false;
      where.auction = {
        status: { in: ['sold', 'completed'] },
      };
    } else if (normalizedStatus === 'outbid') {
      where.isOutbid = true;
      where.isDeleted = false;
    } else if (normalizedStatus === 'cancelled') {
      where.isDeleted = true;
    }
  }

  // ✅ NEW: Handle highest bidder filter
  if (highestBidderOnly === 'true' || highestBidderOnly === true) {
    where.isDeleted = false;
    // This requires joining with auction and filtering where bid is the highest
    where.auction = {
      ...where.auction, // Preserve existing auction filters
      highestBidId: { not: null }, // Only auctions with a highest bid
    };
    // We'll do the actual bid matching in the include/filter logic below
  }

  // ✅ NEW: Handle winning bids filter
  if (winningBidsOnly === 'true' || winningBidsOnly === true) {
    where.isDeleted = false;
    where.auction = {
      ...where.auction,
      status: { in: ['sold', 'completed', 'ended'] },
      winnerId: bidderId, // User must be the winner
    };
  }

  // Amount range filter
  if (minAmount !== undefined || maxAmount !== undefined) {
    where.amount = {};
    if (minAmount !== undefined) where.amount.gte = parseFloat(minAmount);
    if (maxAmount !== undefined) where.amount.lte = parseFloat(maxAmount);
  }

  // Date range filter
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate);
    if (endDate) where.createdAt.lte = new Date(endDate);
  }

  // Build default include relations
  const includeRelations = {
    bidder: {
      select: {
        id: true,
        username: true,
        profilePicture: true,
        isDeleted: true,
      },
    },
    auction: {
      select: {
        id: true,
        title: true,
        images: true,
        status: true,
        endDate: true,
        isDeleted: true,
        highestBidId: true, // ✅ Needed for filtering
        winnerId: true,      // ✅ Needed for filtering
      },
    },
  };

  // Build query options
  const queryOptions = {
    where,
    orderBy: { [sortField]: orderDirection },
    skip,
    take,
    include: includeRelations
  };

  // ✅ NEW: For highestBidderOnly, we need to join and filter
  // This is tricky because we need to match bid.id === auction.highestBidId
  if (highestBidderOnly === 'true' || highestBidderOnly === true) {
    // We'll fetch the auctions first, then match bids
    // Better approach: Use a subquery or raw SQL, but for now we'll filter after fetch
    // and recalculate pagination (inefficient but works for now)
    
    // Alternative: Use Prisma's nested filter (requires more complex query)
  }

  // Handle field selection...
  if (fields && fields.length > 0) {
    // ... (keep your existing field selection logic)
  }

  // Execute query
  const [bids, count] = await Promise.all([
    prisma.bid.findMany(queryOptions),
    prisma.bid.count({ where })
  ]);

  // ✅ NEW: Post-filter for highestBidderOnly if needed
  if (highestBidderOnly === 'true' || highestBidderOnly === true) {
    const filteredBids = bids.filter(bid => bid.auction.highestBidId === bid.id);
    
    return {
      data: filteredBids,
      pagination: {
        currentPage: pageNum,
        total: filteredBids.length,
        totalPages: Math.ceil(filteredBids.length / take),
        itemsPerPage: take,
        hasNext: pageNum < Math.ceil(filteredBids.length / take),
        hasPrev: pageNum > 1,
      },
    };
  }

  return {
    data: bids,
    pagination: {
      currentPage: pageNum,
      total: count,
      totalPages: Math.ceil(count / take),
      itemsPerPage: take,
      hasNext: pageNum < Math.ceil(count / take),
      hasPrev: pageNum > 1,
    },
  };
}

export const getMyBids = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const {
      page = 1,
      limit = 10,
      sort = 'createdAt',
      order = 'desc',
      status,
      auctionId,
      minAmount,
      maxAmount,
      startDate,
      endDate,
      fields,
      highestBidderOnly = 'false',
      winningBidsOnly = 'false'
    } = req.query;

    const isAdmin = req.user?.role === 'admin';

    // Check if user has permission to view cancelled bids
    if (status === 'cancelled' && !isAdmin) {
      throw new AppError('NOT_AUTHORIZED', 'Not authorized to view cancelled bids', 403);
    }

    // ✅ Single repository call with all filters
    const { data: bids, pagination } = await listAllBidsPrisma({
      bidderId: userId,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 10,
      sort,
      order,
      status,
      auctionId,
      minAmount: minAmount ? parseFloat(minAmount) : undefined,
      maxAmount: maxAmount ? parseFloat(maxAmount) : undefined,
      startDate,
      endDate,
      fields: fields?.split(',').map(f => f.trim()),
      highestBidderOnly,  // ✅ Pass through
      winningBidsOnly     // ✅ Pass through
    });

    // ✅ Keep enhancement logic in controller (presentation layer)
    const enhancedBids = await Promise.all(
      bids.map(async bid => {
        const [auction, highestBid] = await Promise.all([
          prisma.auction.findUnique({
            where: { id: bid.auctionId },
            select: {
              status: true,
              endDate: true,
              winnerId: true,
              highestBidId: true,
            },
          }),
          // Only fetch highest bid if needed for performance
          (highestBidderOnly === 'true' || winningBidsOnly === 'true') 
            ? null
            : prisma.bid.findFirst({
                where: { auctionId: bid.auctionId, isDeleted: false },
                orderBy: { amount: 'desc' },
                select: { id: true, bidderId: true },
              }),
        ]);

        const isActive = auction?.status === 'active' && new Date(auction.endDate) > new Date();
        const isEnded = auction ? ['ended', 'sold', 'completed'].includes(auction.status) : false;
        const isWinning = isActive
          ? highestBid?.bidderId === bid.bidderId
          : auction?.winnerId === bid.bidderId;

        return {
          ...bid,
          isWinning,
          auctionStatus: auction?.status,
          timeRemaining: isActive && auction?.endDate ? new Date(auction.endDate) - new Date() : null,
          isActive,
          isEnded,
        };
      })
    );

    res.status(200).json({
      status: 'success',
      pagination,
      data: { bids: enhancedBids },
    });
  } catch (error) {
    logger.error('Get my bids error:', { 
      error: error.message, 
      stack: error.stack,
      userId: req.user?.id  // ✅ Better logging
    });
    next(error);
  }
};