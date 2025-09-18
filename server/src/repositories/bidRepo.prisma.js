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
            NOT: { winnerId: where.bidderId } // The bidder didn't win
          }
        }
      ];
    } else if (normalizedStatus === 'outbid') {
      // This requires additional logic to determine if a bid was outbid
      // You might need to add a field to track this
      where.isOutbid = true;
    } else if (normalizedStatus === 'cancelled') {
      where.auction = {
        status: 'cancelled',
        isDeleted: true,
      };
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

  const [total, bids] = await Promise.all([
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
            email: true
          }
        },
        auction: {
          select: {
            id: true,
            title: true,
            currentPrice: true,
            endDate: true,
            status: true,
            winnerId: true,
          }
        }
      },
    }),
  ]);

  return {
    bids,
    total,
    page: pageNum,
    limit: take,
    totalPages: Math.ceil(total / limit),
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
  if (status === 'active') {
    where.auction = {
      status: 'active',
      endDate: { gt: new Date() },
    };
  } else if (status === 'won') {
    where.auction = {
      status: 'sold',
      winnerId: bidderId,
    };
  } else if (status === 'lost') {
    where.NOT = {
      auction: {
        winnerId: bidderId,
      },
    };
    where.auction = {
      status: { in: ['ended', 'sold'] },
    };
  } else if (status === 'outbid') {
    where.isOutbid = true;
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
  const [bids] = await Promise.all([
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
  showDeleted = false,
  page = 1,
  limit = 10,
  sort = 'amount:desc',
}) {
  const pageNum = Math.max(1, parseInt(page));
  const take = Math.min(Math.max(1, parseInt(limit)), 100);
  const skip = (pageNum - 1) * take;

  // Build where filter
  const where = { auctionId };

  if (!showDeleted) {
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
