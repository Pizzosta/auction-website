import { Prisma } from '@prisma/client';
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
      where.AND = [{ status: 'active' }, { endDate: { gt: new Date() } }];
    } else if (normalizedStatus === 'upcoming') {
      where.AND = [{ status: 'upcoming' }, { startDate: { gt: new Date() } }];
    } else if (normalizedStatus === 'ended') {
      where.OR = [
        { status: 'ended' },
        {
          AND: [{ status: 'active' }, { endDate: { lte: new Date() } }],
        },
      ];
    } else if (normalizedStatus === 'sold') {
      where.status = 'sold';
    } else if (normalizedStatus === 'cancelled') {
      where.AND = [{ status: 'cancelled' }, { isDeleted: true }];
    } else if (normalizedStatus === 'all') {
      // no filter (include everything)
    } else {
      // fallback for unknown status strings
      where.status = normalizedStatus;
    }
  }

  // Other filters
  if (category) where.category = { equals: category, mode: 'insensitive' };
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
    'title',
    'description',
    'startingPrice',
    'currentPrice',
    'startDate',
    'endDate',
    'createdAt',
    'bidCount',
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

  return { auctions, count, page: pageNum, limit: take, totalPages: Math.ceil(count / take) };
}

/**
 * Create a new auction
 * @param {Object} data - Auction data
 * @returns {Promise<Object>} Created auction
 */
export const createAuctionPrisma = async (data) => {
  return prisma.auction.create({
    data: {
      ...data,
      status: 'upcoming',
      startingPrice: new Prisma.Decimal(data.startingPrice),
      currentPrice: new Prisma.Decimal(data.startingPrice),
      bidIncrement: new Prisma.Decimal(data.bidIncrement),
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
    },
    include: {
      seller: { select: { username: true, email: true, role: true } },
    },
  });
};

/**
 * Find auction by ID with optional includes
 * @param {string} id - Auction ID
 * @param {Object} [options] - Options
 * @param {boolean} [options.includeSeller] - Include seller details
 * @param {boolean} [options.includeWinner] - Include winner details
 * @returns {Promise<Object|null>} Auction or null if not found
 */
export const findAuctionById = async (id, options = {}) => {
  const { includeSeller = false, includeWinner = false } = options;

  return prisma.auction.findUnique({
    where: { id },
    include: {
      ...(includeSeller && { seller: { select: { username: true } } }),
      ...(includeWinner && { winner: { select: { username: true } } }),
    },
  });
};

/**
 * Update an auction
 * @param {string} id - Auction ID
 * @param {Object} data - Data to update
 * @param {number} version - Current version for optimistic concurrency
 * @returns {Promise<Object>} Updated auction
 */
export const updateAuctionPrisma = async (id, data, version) => {
  return prisma.auction.update({
    where: { id, version },
    data: {
      ...data,
      ...(data.startingPrice && { startingPrice: new Prisma.Decimal(data.startingPrice) }),
      ...(data.currentPrice && { currentPrice: new Prisma.Decimal(data.currentPrice) }),
      ...(data.bidIncrement && { bidIncrement: new Prisma.Decimal(data.bidIncrement) }),
      ...(data.startDate && { startDate: new Date(data.startDate) }),
      ...(data.endDate && { endDate: new Date(data.endDate) }),
      version: { increment: 1 },
    },
  });
};

/**
 * Soft delete an auction
 * @param {string} id - Auction ID
 * @param {string} deletedById - ID of the user performing the deletion
 * @param {number} version - Current version for optimistic concurrency
 * @returns {Promise<Object>} Updated auction
 */
export const softDeleteAuction = async (id, deletedById, version) => {
  return prisma.auction.update({
    where: { id, version },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
      deletedById,
      version: { increment: 1 },
    },
  });
};

/**
 * Permanently delete an auction
 * @param {string} id - Auction ID
 * @param {number} version - Current version for optimistic concurrency
 * @returns {Promise<Object>} Deleted auction
 */
export const deleteAuctionPermanently = async (id, version) => {
  return prisma.auction.delete({
    where: { id, version },
  });
};

/**
 * Find auction with minimal fields needed for deletion
 * @param {string} id - Auction ID
 * @returns {Promise<Object|null>} Auction with minimal fields or null if not found
 */
export const findAuctionPrisma = async (id) => {
  return prisma.auction.findUnique({
    where: { id },
    select: {
      id: true,
      sellerId: true,
      startDate: true,
      images: true,
      version: true,
    },
  });
};

/**
 * Find deleted auction with minimal fields needed for deletion
 * @param {string} id - Auction ID
 * @returns {Promise<Object|null>} Auction with minimal fields or null if not found
 */
export const findDeletedAuction = async (id) => {
  return prisma.auction.findUnique({
    where: { id },
    select: { isDeleted: true, endDate: true },
  });
};

/**
 * Restore a soft-deleted auction
 * @param {string} id - Auction ID
 * @param {number} version - Current version for optimistic concurrency
 * @returns {Promise<Object>} Restored auction
 */
export const restoreAuctionPrisma = async (id, version) => {
  return prisma.auction.update({
    where: { id, version },
    data: {
      isDeleted: false,
      deletedAt: null,
      deletedById: null,
      version: { increment: 1 },
    },
  });
};
