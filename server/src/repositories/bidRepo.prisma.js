import prisma from '../config/prisma.js';

/**
 * List bids with filtering and pagination
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
