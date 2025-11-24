import prisma from '../config/prisma.js';

/**
 * List all bids with pagination, filtering, and field selection (Admin only)
 * @param {Object} options - Query options
 * @param {number} [options.page=1] - Page number
 * @param {number} [options.limit=10] - Items per page
 * @param {string} [options.sort='createdAt'] - Field to sort by
 * @param {string} [options.order='desc'] - Sort order ('asc' or 'desc')
 * @param {string} [options.status] - Bid status ('active', 'outbid', 'cancelled', 'won')
 * @param {string} [options.auctionId] - Auction ID to filter bids for
 * @param {string} [options.bidderId] - Bidder ID to filter bids for
 * @param {number} [options.minAmount] - Minimum bid amount
 * @param {number} [options.maxAmount] - Maximum bid amount
 * @param {string} [options.startDate] - Start date for filtering
 * @param {string} [options.endDate] - End date for filtering
 * @param {string[]} [options.fields] - Fields to include in the response
 * @returns {Promise<Object>} - Object containing bids and pagination info
 */
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
}) {
  const pageNum = Math.max(1, parseInt(page));
  const take = Math.min(Math.max(1, parseInt(limit)), 100);
  const skip = (pageNum - 1) * take;

  // Parse sort parameter
  const allowedSortFields = new Set(['createdAt', 'amount', 'updatedAt']);
  const sortField = allowedSortFields.has(sort) ? sort : 'createdAt';
  const orderDirection = order === 'asc' ? 'asc' : 'desc';
  const orderBy = { [sortField]: orderDirection };

  // Build where filter
  const where = {};

  if (auctionId) where.auctionId = auctionId;
  if (bidderId) where.bidderId = bidderId;

  // Handle status filter
  if (status) {
    const normalizedStatus = status.toLowerCase();

    if (normalizedStatus === 'active') {
      where.isDeleted = false;
      where.auction = {
        status: 'active',
        endDate: { gt: new Date() },
        highestBidId: bidderId
      };
    } else if (normalizedStatus === 'won') {
      where.isDeleted = false;
      where.auction = {
        status: { in: ['sold', 'completed'] },
        winnerId: bidderId, // User must be the winner
      };
    } else if (normalizedStatus === 'outbid') {
      where.isOutbid = true;
      where.auction = {
        status: 'active',
      };
      where.isDeleted = false;
    } else if (normalizedStatus === 'lost') {
      where.isOutbid = true;
      where.auction = {
        status: { in: ['sold', 'completed'] },
      };
      where.isDeleted = false;
    } else if (normalizedStatus === 'cancelled') {
      where.isDeleted = true;
    }
  } else {
    // Default behavior - don't show deleted bids
    where.isDeleted = false;
  }

  // Amount range filter
  if (minAmount !== undefined || maxAmount !== undefined) {
    where.amount = {};
    if (minAmount !== undefined) where.amount.gte = parseInt(minAmount);
    if (maxAmount !== undefined) where.amount.lte = parseInt(maxAmount);
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
        highestBidId: true,
        winnerId: true,
      },
    },
  };

  // Build query options
  const queryOptions = {
    where,
    orderBy,
    skip,
    take,
    include: includeRelations
  };

  // Handle field selection
  if (fields && fields.length > 0) {
    const fieldSet = new Set(fields.map(f => f.trim()));

    delete queryOptions.include;
    queryOptions.select = { id: true };

    const mainFields = ['amount', 'createdAt', 'updatedAt', 'isOutbid', 'isDeleted', 'deletedAt', 'outbidAt'];
    const relationFields = ['bidder', 'auction'];

    // Process Main Fields (simple inclusion)
    mainFields.forEach(field => {
      if (fieldSet.has(field)) {
        queryOptions.select[field] = true;
      }
    });

    // Process Relationships (must check for both parent field and specific nested fields)
    relationFields.forEach(parentField => {
      // Find all fields requested for this relationship (e.g., 'auction', 'auction.id', 'auction.title')
      const requestedNestedFields = fields.filter(f => f.startsWith(parentField));

      if (requestedNestedFields.length > 0) {
        // Get the default select structure for this relation
        const defaultRelationSelect = includeRelations[parentField].select;

        // Check if the full parent object was requested (e.g., fields=auction)
        const parentRequested = fieldSet.has(parentField);

        if (parentRequested) {
          // If parent requested, use the full default select
          queryOptions.select[parentField] = includeRelations[parentField];
        } else {
          // Initialize the nested select object
          const nestedSelect = { id: true }; // Always include nested ID for context

          // Fields to check inside the nested model (excluding the parent field name)
          const nestedKeys = Object.keys(defaultRelationSelect).filter(k => k !== 'id' && k !== 'isDeleted');

          requestedNestedFields.forEach(fullKey => {
            const nestedKey = fullKey.split('.')[1]; // e.g., 'id' from 'auction.id'

            if (nestedKey && nestedKeys.includes(nestedKey)) {
              nestedSelect[nestedKey] = true;
            }
          });

          queryOptions.select[parentField] = { select: nestedSelect };
        }
      }
    });
  }

  // Execute queries in parallel
  const [bids, count] = await Promise.all([
    prisma.bid.findMany(queryOptions),
    prisma.bid.count({ where })
  ]);

  const totalPages = Math.ceil(count / take);

  return {
    data: bids,
    pagination: {
      currentPage: pageNum,
      total: count,
      totalPages,
      itemsPerPage: take,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1,
    },
  };
}

export async function findOutbidCandidates(auctionId, newBidAmount, excludeBidderId) {
  return prisma.bid.findMany({
    where: {
      auctionId,
      amount: { lt: newBidAmount },
      isOutbid: false,
      isDeleted: false,
      bidderId: { not: excludeBidderId },
    },
    include: {
      bidder: {
        select: { id: true, email: true, firstname: true },
      },
      auction: { select: { id: true, title: true, endDate: true } },
    },
  });
}

export async function findCurrentHighestBid(auctionId) {
  return prisma.bid.findFirst({
    where: { auctionId, isDeleted: false, isOutbid: false },
    orderBy: { amount: 'desc' },
    select: { id: true, amount: true },
    take: 1,
  });
}

export async function getBidWithAuction(bidId) {
  return prisma.bid.findUnique({
    where: { id: bidId },
    include: { auction: { select: { id: true, status: true, endDate: true, currentPrice: true, startingPrice: true } } },
  });
}
