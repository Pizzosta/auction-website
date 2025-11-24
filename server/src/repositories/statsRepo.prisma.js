import prisma from '../config/prisma.js';

// System / Users
export async function countUsersSince(startDate) {
  const totalUsers = await prisma.user.count({ where: { isDeleted: false, createdAt: { gte: startDate } } });
  const activeUsers = await prisma.user.count({ where: { isDeleted: false, updatedAt: { gte: startDate } } });
  const deletedUsers = await prisma.user.count({ where: { isDeleted: true, createdAt: { gte: startDate } } });
  const newUsers = await prisma.user.count({ where: { isDeleted: false, createdAt: { gte: startDate } } });
  return { totalUsers, activeUsers, deletedUsers, newUsers };
}

// Auctions overview
export async function countAuctionsSince(startDate) {
  const totalAuctions = await prisma.auction.count({ where: { isDeleted: false, createdAt: { gte: startDate } } });
  const activeAuctions = await prisma.auction.count({ where: { isDeleted: false, endDate: { gt: new Date() }, startDate: { lte: new Date() } } });
  const endedAuctions = await prisma.auction.count({ where: { isDeleted: false, endDate: { gte: startDate, lte: new Date() } } });
  return { totalAuctions, activeAuctions, endedAuctions };
}

// Bid overview
export async function countBidsSince(startDate) {
  const totalBids = await prisma.bid.count({ where: { isDeleted: false, createdAt: { gte: startDate } } });
  const today = new Date();
  const bidsToday = await prisma.bid.count({ where: { isDeleted: false, createdAt: { gte: new Date(today.setHours(0, 0, 0, 0)) } } });
  const avgBidsRaw = await prisma.$queryRaw`
    SELECT AVG(bid_count) as avg_bids
    FROM (
      SELECT COUNT(*) as bid_count
      FROM "Bid"
      WHERE "isDeleted" = false
      GROUP BY "auctionId"
    ) as bid_counts
  `;
  const avgBids = Number(avgBidsRaw[0]?.avg_bids || 0);
  return { totalBids, bidsToday, avgBids };
}

// Auction detailed stats used by getAuctionStats
export async function fetchAuctionStatsSince(startDate) {
  const totalAuctions = await prisma.auction.count({ where: { isDeleted: false, createdAt: { gte: startDate } } });

  const activeAuctions = await prisma.auction.count({ where: { isDeleted: false, startDate: { lte: new Date() }, endDate: { gte: new Date() }, createdAt: { gte: startDate } } });

  const completedAuctions = await prisma.auction.count({ where: { isDeleted: false, endDate: { lt: new Date() }, createdAt: { gte: startDate } } });

  const upcomingAuctions = await prisma.auction.count({ where: { isDeleted: false, startDate: { gt: new Date() }, createdAt: { gte: startDate } } });

  const auctionsByCategory = await prisma.auction.groupBy({
    by: ['category'],
    where: { isDeleted: false, createdAt: { gte: startDate } },
    _count: { category: true },
    orderBy: { _count: { category: 'desc' } },
    take: 5,
  });

  const avgBidsRaw = await prisma.$queryRaw`
    SELECT AVG(bid_count) as avg_bids
    FROM (
      SELECT COUNT(*) as bid_count
      FROM "Bid"
      WHERE "isDeleted" = false
      AND "createdAt" >= ${startDate}
      GROUP BY "auctionId"
    ) as bid_counts
  `;

  const avgBidsPerAuction = Number(avgBidsRaw[0]?.avg_bids || 0);

  return { totalAuctions, activeAuctions, completedAuctions, upcomingAuctions, auctionsByCategory, avgBidsPerAuction };
}

// Bid detailed stats used by getBidStats
export async function fetchBidStatsSince(startDate) {
  const totalBids = await prisma.bid.count({ where: { isDeleted: false, createdAt: { gte: startDate } } });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const bidsToday = await prisma.bid.count({ where: { isDeleted: false, createdAt: { gte: todayStart, lt: todayEnd } } });

  const averageBidAmountAgg = await prisma.bid.aggregate({ where: { isDeleted: false, createdAt: { gte: startDate } }, _avg: { amount: true } });

  const highestBid = await prisma.bid.findFirst({ where: { isDeleted: false, createdAt: { gte: startDate } }, orderBy: { amount: 'desc' }, select: { amount: true, auction: { select: { id: true, title: true } }, bidder: { select: { id: true, username: true } } } });

  const bidsByAuction = await prisma.$queryRaw`
    SELECT 
      b."auctionId", 
      a.title,
      COUNT(*)::int as "bidCount"
    FROM "Bid" b
    JOIN "Auction" a ON a.id = b."auctionId"
    WHERE b."isDeleted" = false
    AND b."createdAt" >= ${startDate}
    GROUP BY b."auctionId", a.title
    ORDER BY "bidCount" DESC
    LIMIT 5
  `;

  const bidsByUser = await prisma.$queryRaw`
    SELECT 
      b."bidderId" as "userId",
      u.username,
      COUNT(*)::int as "bidCount"
    FROM "Bid" b
    JOIN "User" u ON u.id = b."bidderId"
    WHERE b."isDeleted" = false
    AND b."createdAt" >= ${startDate}
    GROUP BY b."bidderId", u.username
    ORDER BY "bidCount" DESC
    LIMIT 5
  `;

  return { totalBids, bidsToday, averageBidAmountAgg, highestBid, bidsByAuction, bidsByUser };
}

// User detailed stats
export async function fetchUserStatsSince(startDate) {
  const totalUsers = await prisma.user.count({ where: { isDeleted: false, createdAt: { gte: startDate } } });

  const activeUsers = await prisma.user.count({ where: { isDeleted: false, lastActiveAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, createdAt: { gte: startDate } } });

  const deletedUsers = await prisma.user.count({ where: { isDeleted: true, createdAt: { gte: startDate } } });

  const newUsers = await prisma.user.count({ where: { isDeleted: false, createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, } });

  const usersByRole = await prisma.user.groupBy({ by: ['role'], where: { isDeleted: false, createdAt: { gte: startDate } }, _count: { role: true }, orderBy: { _count: { role: 'desc' } } });

  return { totalUsers, activeUsers, deletedUsers, newUsers, usersByRole };
}

// Admin convenience functions used by adminController
export async function countActiveAuctions() {
  return prisma.auction.count({ where: { status: 'active', isDeleted: false } });
}

export async function groupActiveByCategory() {
  return prisma.auction.groupBy({ by: ['category'], where: { status: 'active', isDeleted: false }, _count: { _all: true } });
}

export async function countEndedAuctions() {
  return prisma.auction.count({ where: { status: 'ended', isDeleted: false } });
}

export async function groupEndedByCategory() {
  return prisma.auction.groupBy({ by: ['category'], where: { status: 'ended', isDeleted: false }, _count: { _all: true } });
}
