import prisma from '../config/prisma.js';
import logger from '../utils/logger.js';
import { getSocketStats, userRooms, auctionRooms, auctionTimers } from '../middleware/socketMiddleware.js';

/**
 * @swagger
 * tags:
 *   name: Stats
 *   description: System statistics and analytics
 */

/**
 * @swagger
 * /api/stats:
 *   get:
 *     summary: Get system statistics
 *     tags: [Stats]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: System statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     users:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: number
 *                           description: Total number of users
 *                         activeToday:
 *                           type: number
 *                           description: Number of users active today
 *                         newThisWeek:
 *                           type: number
 *                           description: Number of new users this week
 *                     auctions:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: number
 *                           description: Total number of auctions
 *                         active:
 *                           type: number
 *                           description: Number of active auctions
 *                         endedThisWeek:
 *                           type: number
 *                           description: Number of auctions that ended this week
 *                     bids:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: number
 *                           description: Total number of bids
 *                         today:
 *                           type: number
 *                           description: Number of bids placed today
 *                         averagePerAuction:
 *                           type: number
 *                           format: float
 *                           description: Average number of bids per auction
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */
export const getSystemStats = async (req, res) => {
    try {
        const { timeFrame = 'month' } = req.query;
        const now = new Date();
        const today = new Date(now.setHours(0, 0, 0, 0));

        let startDate = new Date(0); // Default to beginning of time

        // Calculate start date based on timeFrame
        switch (timeFrame) {
            case 'day':
                startDate = new Date(now.setDate(now.getDate() - 1));
                break;
            case 'week':
                startDate = new Date(now.setDate(now.getDate() - 7));
                break;
            case 'month':
                startDate = new Date(now.setMonth(now.getMonth() - 1));
                break;
            case 'year':
                startDate = new Date(now.setFullYear(now.getFullYear() - 1));
                break;
            // 'all' will use the default startDate (beginning of time)
        }

        // Get user statistics
        const [totalUsers, activeUsers, deletedUsers, newUsers] = await Promise.all([
            prisma.user.count({
                where: {
                    isDeleted: false,
                    createdAt: { gte: startDate }
                }
            }),
            prisma.user.count({
                where: {
                    isDeleted: false,
                    updatedAt: { gte: startDate }
                }
            }),
            prisma.user.count({
                where: {
                    isDeleted: true,
                    createdAt: { gte: startDate }
                }
            }),
            prisma.user.count({
                where: {
                    isDeleted: false,
                    createdAt: { gte: startDate }
                }
            })
        ]);

        // Get auction statistics
        const [totalAuctions, activeAuctions, endedAuctions] = await Promise.all([
            prisma.auction.count({
                where: {
                    isDeleted: false,
                    createdAt: { gte: startDate }
                }
            }),
            prisma.auction.count({
                where: {
                    isDeleted: false,
                    endDate: { gt: new Date() },
                    startDate: { lte: new Date() }
                }
            }),
            prisma.auction.count({
                where: {
                    isDeleted: false,
                    endDate: {
                        gte: startDate,
                        lte: new Date()
                    }
                }
            })
        ]);

        // Get bid statistics
        const [totalBids, bidsToday, avgBidsPerAuction] = await Promise.all([
            prisma.bid.count({
                where: {
                    isDeleted: false,
                    createdAt: { gte: startDate }
                }
            }),
            prisma.bid.count({
                where: {
                    isDeleted: false,
                    createdAt: { gte: today }
                }
            }),
            prisma.$queryRaw`
        SELECT AVG(bid_count) as avg_bids
        FROM (
          SELECT COUNT(*) as bid_count
          FROM "Bid"
          WHERE "isDeleted" = false
          GROUP BY "auctionId"
        ) as bid_counts
      `
        ]);

        res.status(200).json({
            status: 'success',
            data: {
                users: {
                    total: totalUsers,
                    active: activeUsers,
                    inactive: deletedUsers,
                    new: newUsers
                },
                auctions: {
                    total: totalAuctions,
                    active: activeAuctions,
                    ended: endedAuctions
                },
                bids: {
                    total: totalBids,
                    today: bidsToday,
                    averagePerAuction: Number(avgBidsPerAuction[0]?.avg_bids || 0).toFixed(2)
                },
                timeFrame: {
                    value: timeFrame,
                    startDate: startDate.toISOString(),
                    endDate: new Date().toISOString()
                }
            }
        });
    } catch (error) {
        logger.error('Error fetching system stats:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch system statistics'
        });
    }
};

/**
 * @swagger
 * /api/stats/auctions:
 *   get:
 *     summary: Get auction statistics
 *     tags: [Stats]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: timeFrame
 *         schema:
 *           type: string
 *           enum: [day, week, month, year, all]
 *           default: 'month'
 *         description: Time frame for the statistics
 *     responses:
 *       200:
 *         description: Auction statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalAuctions:
 *                       type: number
 *                     auctionsByStatus:
 *                       type: object
 *                       properties:
 *                         active:
 *                           type: number
 *                         completed:
 *                           type: number
 *                         upcoming:
 *                           type: number
 *                     auctionsByCategory:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           category:
 *                             type: string
 *                           count:
 *                             type: number
 *                     averageBidsPerAuction:
 *                       type: number
 *                       format: float
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */
export const getAuctionStats = async (req, res) => {
    try {
        const { timeFrame = 'month' } = req.query;
        const now = new Date();
        let startDate = new Date(0); // Default to beginning of time

        switch (timeFrame) {
            case 'day':
                startDate = new Date(now.setDate(now.getDate() - 1));
                break;
            case 'week':
                startDate = new Date(now.setDate(now.getDate() - 7));
                break;
            case 'month':
                startDate = new Date(now.setMonth(now.getMonth() - 1));
                break;
            case 'year':
                startDate = new Date(now.setFullYear(now.getFullYear() - 1));
                break;
            // 'all' will use the default startDate (beginning of time)
        }

        const [
            totalAuctions,
            activeAuctions,
            completedAuctions,
            upcomingAuctions,
            auctionsByCategory,
            avgBidsPerAuction
        ] = await Promise.all([
            prisma.auction.count({
                where: {
                    isDeleted: false,
                    createdAt: { gte: startDate }
                }
            }),
            prisma.auction.count({
                where: {
                    isDeleted: false,
                    startDate: { lte: new Date() },
                    endDate: { gte: new Date() },
                    createdAt: { gte: startDate }
                }
            }),
            prisma.auction.count({
                where: {
                    isDeleted: false,
                    endDate: { lt: new Date() },
                    createdAt: { gte: startDate }
                }
            }),
            prisma.auction.count({
                where: {
                    isDeleted: false,
                    startDate: { gt: new Date() },
                    createdAt: { gte: startDate }
                }
            }),
            prisma.auction.groupBy({
                by: ['category'],
                where: {
                    isDeleted: false,
                    createdAt: { gte: startDate }
                },
                _count: {
                    _all: true
                },
                orderBy: {
                    _count: {
                        category: 'desc'
                    }
                },
                take: 5
            }),
            prisma.$queryRaw`
        SELECT AVG(bid_count) as avg_bids
        FROM (
          SELECT COUNT(*) as bid_count
          FROM "Bid"
          WHERE "isDeleted" = false
          AND "createdAt" >= ${startDate}
          GROUP BY "auctionId"
        ) as bid_counts
      `
        ]);

        res.status(200).json({
            status: 'success',
            data: {
                totalAuctions,
                auctionsByStatus: {
                    active: activeAuctions,
                    completed: completedAuctions,
                    upcoming: upcomingAuctions
                },
                auctionsByCategory: auctionsByCategory.map(item => ({
                    category: item.category,
                    count: item._count._all
                })),
                averageBidsPerAuction: Number(avgBidsPerAuction[0]?.avg_bids || 0).toFixed(2)
            }
        });
    } catch (error) {
        logger.error('Error fetching auction stats:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch auction statistics'
        });
    }
};

/**
 * @swagger
 * /api/stats/bids:
 *   get:
 *     summary: Get bid statistics
 *     tags: [Stats]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: timeFrame
 *         schema:
 *           type: string
 *           enum: [day, week, month, year, all]
 *           default: 'month'
 *         description: Time frame for the statistics
 *     responses:
 *       200:
 *         description: Bid statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalBids:
 *                       type: number
 *                     bidsToday:
 *                       type: number
 *                     averageBidAmount:
 *                       type: number
 *                       format: float
 *                     highestBid:
 *                       type: number
 *                       format: float
 *                     bidsByAuction:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           auctionId:
 *                             type: string
 *                           title:
 *                             type: string
 *                           bidCount:
 *                             type: number
 *                     bidsByUser:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           userId:
 *                             type: string
 *                           username:
 *                             type: string
 *                           bidCount:
 *                             type: number
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */
export const getBidStats = async (req, res) => {
    try {
        const { timeFrame = 'month' } = req.query;
        const now = new Date();
        let startDate = new Date(0); // Default to beginning of time

        switch (timeFrame) {
            case 'day':
                startDate = new Date(now.setDate(now.getDate() - 1));
                break;
            case 'week':
                startDate = new Date(now.setDate(now.getDate() - 7));
                break;
            case 'month':
                startDate = new Date(now.setMonth(now.getMonth() - 1));
                break;
            case 'year':
                startDate = new Date(now.setFullYear(now.getFullYear() - 1));
                break;
            // 'all' will use the default startDate (beginning of time)
        }

        const [
            totalBids,
            bidsToday,
            averageBidAmount,
            highestBid,
            bidsByAuction,
            bidsByUser
        ] = await Promise.all([
            // Total bids in time frame
            prisma.bid.count({
                where: {
                    isDeleted: false,
                    createdAt: { gte: startDate }
                }
            }),

            // Bids today
            prisma.bid.count({
                where: {
                    isDeleted: false,
                    createdAt: {
                        gte: new Date(new Date().setHours(0, 0, 0, 0)),
                        lt: new Date(new Date().setHours(23, 59, 59, 999))
                    }
                }
            }),

            // Average bid amount
            prisma.bid.aggregate({
                where: {
                    isDeleted: false,
                    createdAt: { gte: startDate }
                },
                _avg: {
                    amount: true
                }
            }),

            // Highest bid
            prisma.bid.findFirst({
                where: {
                    isDeleted: false,
                    createdAt: { gte: startDate }
                },
                orderBy: {
                    amount: 'desc'
                },
                select: {
                    amount: true,
                    auction: {
                        select: {
                            id: true,
                            title: true
                        }
                    },
                    bidder: {
                        select: {
                            id: true,
                            username: true
                        }
                    }
                }
            }),

            // Bids by auction (top 5)
            prisma.$queryRaw`
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
      `,

            // Bids by user (top 5)
            prisma.$queryRaw`
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
      `
        ]);

        res.status(200).json({
            status: 'success',
            data: {
                totalBids,
                bidsToday,
                averageBidAmount: Number(averageBidAmount._avg.amount || 0).toFixed(2),
                highestBid: {
                    amount: highestBid?.amount ? Number(highestBid.amount) : 0,
                    auction: highestBid?.auction || null,
                    bidder: highestBid?.bidder || null
                },
                bidsByAuction,
                bidsByUser
            }
        });
    } catch (error) {
        logger.error('Error fetching bid stats:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch bid statistics'
        });
    }
};

/**
 * @swagger
 * /api/stats/users:
 *   get:
 *     summary: Get user statistics
 *     tags: [Stats]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: timeFrame
 *         schema:
 *           type: string
 *           enum: [day, week, month, year, all]
 *           default: 'month'
 *         description: Time frame for the statistics
 *     responses:
 *       200:
 *         description: User statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalUsers:
 *                       type: number
 *                     activeUsers:
 *                       type: number
 *                     newUsers:
 *                       type: number
 *                     usersByRole:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           role:
 *                             type: string
 *                           count:
 *                             type: number
 *                     usersByRegistrationSource:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           source:
 *                             type: string
 *                           count:
 *                             type: number
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Internal server error
 */
export const getUserStats = async (req, res) => {
    try {
        const { timeFrame = 'month' } = req.query;
        const now = new Date();
        let startDate = new Date(0); // Default to beginning of time

        switch (timeFrame) {
            case 'day':
                startDate = new Date(now.setDate(now.getDate() - 1));
                break;
            case 'week':
                startDate = new Date(now.setDate(now.getDate() - 7));
                break;
            case 'month':
                startDate = new Date(now.setMonth(now.getMonth() - 1));
                break;
            case 'year':
                startDate = new Date(now.setFullYear(now.getFullYear() - 1));
                break;
            // 'all' will use the default startDate (beginning of time)
        }

        const [
            totalUsers,
            activeUsers,
            deletedUsers,
            newUsers,
            usersByRole,
        ] = await Promise.all([
            prisma.user.count({
                where: {
                    isDeleted: false,
                    createdAt: { gte: startDate }
                }
            }),
            prisma.user.count({
                where: {
                    isDeleted: false,
                    lastActiveAt: {
                        gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Active in last 30 days
                    },
                    createdAt: { gte: startDate }
                }
            }),
            prisma.user.count({
                where: {
                    isDeleted: true,
                    createdAt: { gte: startDate }
                }
            }),
            prisma.user.count({
                where: {
                    isDeleted: false,
                    createdAt: {
                        gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Registered in last 30 days
                    },
                    createdAt: { gte: startDate }
                }
            }),
            prisma.user.groupBy({
                by: ['role'],
                where: {
                    isDeleted: false,
                    createdAt: { gte: startDate }
                },
                _count: {
                    role: true
                },
                orderBy: {
                    _count: {
                        role: 'desc'
                    }
                }
            })
        ]);

        res.status(200).json({
            status: 'success',
            data: {
                totalUsers,
                activeUsers,
                deletedUsers,
                newUsers,
                usersByRole: usersByRole.map(item => ({
                    role: item.role,
                    count: item._count._all
                })),
            }
        });
    } catch (error) {
        logger.error('Error fetching user stats:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch user statistics'
        });
    }
};


export const getSocketStatsController = (req, res) => {
    try {
        // Basic stats from getSocketStats
        const stats = getSocketStats();

        res.json({
            status: 'success',
            data: {
                ...stats,
                timestamp: new Date().toISOString(),
                uptime: process.uptime()
            }
        });
    } catch (error) {
        logger.error('Error retrieving socket stats', {
            error: error.message,
            userId: req.user.id
        });

        res.status(500).json({
            status: 'error',
            message: 'Failed to retrieve socket statistics'
        });
    }
};


export const getSocketRoomsController = (req, res) => {
    try {
        const detailedRoomInfo = 
            // Additional detailed information
            {
                userRooms: Array.from(userRooms.entries()).map(([userId, rooms]) => ({
                    userId,
                    roomCount: rooms.size,
                    rooms: Array.from(rooms)
                })),
                auctionRooms: Array.from(auctionRooms.entries()).map(([auctionId, room]) => ({
                    auctionId,
                    bidders: Array.from(room.bidders),
                    biddersCount: room.bidders.size,
                    viewers: room.viewers,
                    total: room.bidders.size + room.viewers
                })),
                auctionTimers: Array.from(auctionTimers.entries()).map(([auctionId, timer]) => ({
                    auctionId,
                    hasTimer: !!timer.timer,
                    hasInterval: !!timer.interval,
                    endTime: timer.endTime
                }))
            };

        res.json({
            status: 'success',
            data: {
                detailedRoomInfo,
                timestamp: new Date().toISOString(),
                uptime: process.uptime()
            }
        });
    } catch (error) {
        logger.error('Error retrieving socket rooms', {
            error: error.message,
            userId: req.user?.id,
            stack: error.stack
        });

        res.status(500).json({
            status: 'error',
            message: 'Failed to retrieve room information'
        });
    }
};