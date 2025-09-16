import prisma from '../config/prisma.js';

// Maps REST query params to Prisma where/orderBy objects and returns {auctions, count}
export async function listAuctionsPrisma({
  status,
  category,
  search,
  seller,
  winner,
  minPrice,
  maxPrice,
  startDate,
  endDate,
  endingSoon,
  page = 1,
  limit = 10,
  sort = 'createdAt:desc',
  showDeleted = false,
}) {
  const pageNum = Math.max(1, parseInt(page));
  const take = Math.min(Math.max(1, parseInt(limit)), 100);
  const skip = (pageNum - 1) * take;

  // Build where filter
  const where = {};

  // Handle status filter
  if (status) {
    if (status === 'active') {
      where.AND = [
        { status: 'active' },
        { endDate: { gt: new Date() } },
      ];
    } else if (status === 'upcoming') {
      where.AND = [
        { status: 'upcoming' },
        { startDate: { gt: new Date() } },
      ];
    } else if (status === 'ended') {
      where.OR = [
        { status: 'ended' },
        { 
          AND: [
            { status: 'active' },
            { endDate: { lte: new Date() } },
          ],
        },
      ];
    } else if (status === 'sold') {
      where.status = 'sold';
    } else {
      where.status = status;
    }
  }

  // Handle deleted items
  if (!showDeleted) {
    where.isDeleted = false;
  }

  // Other filters
  if (category) where.category = category;
  if (seller) where.sellerId = seller;
  if (winner) where.winnerId = winner;
  if (minPrice) where.currentPrice = { gte: parseFloat(minPrice) };
  if (maxPrice) where.currentPrice = { ...where.currentPrice, lte: parseFloat(maxPrice) };
  if (startDate) where.startDate = { gte: new Date(startDate) };
  if (endDate) where.endDate = { lte: new Date(endDate) };
  if (endingSoon) {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    where.endDate = { gte: now, lte: tomorrow };
  }

  // Search
  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  // Sort
  let [field, order] = String(sort).split(':');
  if (!field) field = 'createdAt';
  const allowedSortFields = new Set([
    'title', 'description', 'startingPrice', 'currentPrice', 
    'startDate', 'endDate', 'createdAt', 'bidCount'
  ]);
  if (!allowedSortFields.has(field)) field = 'createdAt';
  const orderBy = { [field]: order === 'asc' ? 'asc' : 'desc' };

  // Execute queries
  const [count, auctions] = await Promise.all([
    prisma.auction.count({ where }),
    prisma.auction.findMany({
      where,
      orderBy,
      skip,
      take,
      include: {
        seller: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            email: true,
          },
        },
        winner: {
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
    auctions,
    count,
    pageNum,
    take,
  };
}
