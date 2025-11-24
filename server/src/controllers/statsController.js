import logger from '../utils/logger.js';
import { getSocketStats, userRooms, auctionRooms, auctionTimers } from '../middleware/socketMiddleware.js';
import * as statsRepo from '../repositories/statsRepo.prisma.js';

export const getSystemStats = async (req, res, next) => {
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

        // Delegate data-access to repository layer
        const [userStats, auctionStats, bidStats] = await Promise.all([
            statsRepo.countUsersSince(startDate),
            statsRepo.countAuctionsSince(startDate),
            statsRepo.countBidsSince(startDate)
        ]);

        res.status(200).json({
            status: 'success',
            data: {
                users: {
                    total: userStats.totalUsers,
                    active: userStats.activeUsers,
                    inactive: userStats.deletedUsers,
                    new: userStats.newUsers
                },
                auctions: {
                    total: auctionStats.totalAuctions,
                    active: auctionStats.activeAuctions,
                    ended: auctionStats.endedAuctions
                },
                bids: {
                    total: bidStats.totalBids,
                    today: bidStats.bidsToday,
                    averagePerAuction: Number(bidStats.avgBids || 0).toFixed(2)
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
        next(error);
    }
};

export const getAuctionStats = async (req, res, next) => {
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

        const {
            totalAuctions,
            activeAuctions,
            completedAuctions,
            upcomingAuctions,
            auctionsByCategory,
            avgBidsPerAuction
        } = await statsRepo.fetchAuctionStatsSince(startDate);

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
                    count: item._count?._all ?? item.count ?? 0
                })),
                averageBidsPerAuction: Number(avgBidsPerAuction || 0).toFixed(2)
            }
        });
    } catch (error) {
        logger.error('Error fetching auction stats:', error);
        next(error);
    }
};

export const getBidStats = async (req, res, next) => {
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

        const {
            totalBids,
            bidsToday,
            averageBidAmountAgg,
            highestBid,
            bidsByAuction,
            bidsByUser
        } = await statsRepo.fetchBidStatsSince(startDate);

        res.status(200).json({
            status: 'success',
            data: {
                totalBids,
                bidsToday,
                averageBidAmount: Number(averageBidAmountAgg._avg?.amount || averageBidAmountAgg._avg || 0).toFixed(2),
                highestBid: highestBid || null,
                bidsByAuction,
                bidsByUser
            }
        });
    } catch (error) {
        logger.error('Error fetching bid stats:', error);
        next(error);
    }
};

export const getUserStats = async (req, res, next) => {
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

        const userStats = await statsRepo.fetchUserStatsSince(startDate);

        res.status(200).json({
            status: 'success',
            data: {
                totalUsers: userStats.totalUsers,
                activeUsers: userStats.activeUsers,
                deletedUsers: userStats.deletedUsers,
                newUsers: userStats.newUsers,
                usersByRole: (userStats.usersByRole || []).map(item => ({
                    role: item.role,
                    count: item._count?.role ?? item._count?._all ?? item.count ?? 0
                })),
            }
        });
    } catch (error) {
        logger.error('Error fetching user stats:', error);
        next(error);
    }
};

export const getSocketStatsController = (req, res, next) => {
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
        next(error);
    }
};


export const getSocketRoomsController = (req, res, next) => {
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

        next(error);
    }
};