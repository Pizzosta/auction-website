import prisma from '../config/prisma.js';
import logger from '../utils/logger.js';

// Helper to update user's average rating
const updateUserRating = async (userId) => {
    const result = await prisma.feedback.aggregate({
        where: { toUserId: userId },
        _avg: { rating: true },
        _count: true
    });

    await prisma.user.update({
        where: { id: userId },
        data: {
            rating: result._avg.rating,
            ratingCount: result._count
        }
    });
};

// Create feedback
export const createFeedback = async (req, res) => {
    try {
        const { auctionId, rating, comment, type, isAnonymous } = req.body;
        const fromUserId = req.user.id;

        // Validate rating
        if (rating < 1 || rating > 5) {
            return res.status(400).json({ status: 'error', message: 'Rating must be between 1 and 5' });
        }

        // Get auction with related data
        const auction = await prisma.auction.findUnique({
            where: { id: auctionId, isDeleted: false },
            include: {
                seller: true,
                highestBid: {
                    include: {
                        bidder: true
                    }
                }
            }
        });

        if (!auction) {
            return res.status(404).json({ status: 'error', message: 'Auction not found' });
        }

        // Validate auction status
        if (auction.status !== 'sold') {
            return res.status(400).json({ status: 'error', message: 'Feedback can only be left for sold auctions' });
        }

        // Determine who is giving feedback to whom
        let toUserId;
        if (type === 'seller') {
            toUserId = auction.sellerId;
            if (auction.winnerId !== fromUserId) {
                return res.status(403).json({ status: 'error', message: 'Only the winning bidder can leave seller feedback' });
            }
        } else if (type === 'buyer') {
            toUserId = auction.winnerId;
            if (auction.sellerId !== fromUserId) {
                return res.status(403).json({ status: 'error', message: 'Only the seller can leave buyer feedback' });
            }
        } else {
            return res.status(400).json({ status: 'error', message: 'Invalid feedback type' });
        }

        // Check if feedback already exists
        const existingFeedback = await prisma.feedback.findUnique({
            where: {
                auctionId_fromUserId_type: {
                    auctionId,
                    fromUserId,
                    type
                }
            }
        });

        if (existingFeedback) {
            return res.status(400).json({ status: 'error', message: 'Feedback already submitted for this auction' });
        }

        // Create feedback
        const feedback = await prisma.feedback.create({
            data: {
                rating,
                comment,
                type,
                auctionId,
                fromUserId,
                toUserId,
                isAnonymous: !!isAnonymous
            },
            include: {
                fromUser: {
                    select: {
                        id: true,
                        username: true,
                        profilePicture: true
                    }
                },
                auction: {
                    select: {
                        id: true,
                        title: true
                    }
                }
            }
        });

        // Update user's rating
        await updateUserRating(toUserId);

        res.status(201).json(feedback);
    } catch (error) {
        logger.error('Error creating feedback', {
            error: error.message,
            userId: req.user?.id,
            stack: error.stack
        });
        res.status(500).json({ status: 'error', message: 'Failed to submit feedback' });
    }
};

// Get feedback for a user
export const getUserFeedback = async (req, res) => {
    try {
        const { userId } = req.params;
        const { type, page = 1, limit = 10 } = req.query;

        const where = { toUserId: userId };
        if (type && ['seller', 'buyer'].includes(type)) {
            where.type = type;
        }

        const [feedbacks, total] = await Promise.all([
            prisma.feedback.findMany({
                where,
                include: {
                    fromUser: {
                        select: {
                            id: true,
                            username: true,
                            profilePicture: true
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
                orderBy: { createdAt: 'desc' },
                skip: (parseInt(page) - 1) * parseInt(limit),
                take: parseInt(limit)
            }),
            prisma.feedback.count({ where })
        ]);

        res.json({
            data: feedbacks,
            meta: {
                total,
                page: parseInt(page),
                totalPages: Math.ceil(total / parseInt(limit) || 1)
            }
        });
    } catch (error) {
        logger.error('Error fetching feedback', {
            error: error.message,
            stack: error.stack
        });
        res.status(500).json({ status: 'error', message: 'Failed to fetch feedback' });
    }
};

// Respond to feedback
export const respondToFeedback = async (req, res) => {
    try {
        const { feedbackId } = req.params;
        const { response } = req.body;
        const userId = req.user.id;

        const feedback = await prisma.feedback.findUnique({
            where: { id: feedbackId },
            include: {
                auction: true,
                toUser: true
            }
        });

        if (!feedback) {
            return res.status(404).json({ status: 'error', message: 'Feedback not found' });
        }

        // Only the user who received the feedback can respond
        if (feedback.toUserId !== userId) {
            return res.status(403).json({ status: 'error', message: 'Not authorized to respond to this feedback' });
        }

        const updatedFeedback = await prisma.feedback.update({
            where: { id: feedbackId },
            data: { response },
            include: {
                fromUser: {
                    select: {
                        id: true,
                        username: true,
                        profilePicture: true
                    }
                }
            }
        });

        res.json(updatedFeedback);
    } catch (error) {
        logger.error('Error responding to feedback', {
            error: error.message,
            stack: error.stack
        });
        res.status(500).json({ status: 'error', message: 'Failed to respond to feedback' });
    }
};

// Get feedback summary for a user
export const getFeedbackSummary = async (req, res) => {
    try {
        const { userId } = req.params;

        const [sellerFeedback, buyerFeedback] = await Promise.all([
            prisma.feedback.groupBy({
                by: ['rating'],
                where: {
                    toUserId: userId,
                    type: 'seller'
                },
                _count: {
                    rating: true
                }
            }),
            prisma.feedback.groupBy({
                by: ['rating'],
                where: {
                    toUserId: userId,
                    type: 'buyer'
                },
                _count: {
                    rating: true
                }
            })
        ]);

        const calculateStats = (feedback) => {
            const total = feedback.reduce((sum, item) => sum + item._count.rating, 0);
            const average = feedback.length > 0
                ? feedback.reduce((sum, item) => sum + (item.rating * item._count.rating), 0) / total
                : 0;

            const distribution = Array(5).fill(0).map((_, i) => {
                const rating = 5 - i;
                const count = feedback.find(f => f.rating === rating)?._count.rating || 0;
                return { rating, count, percentage: total > 0 ? Math.round((count / total) * 100) : 0 };
            });

            return { total, average, distribution };
        };

        res.json({
            seller: calculateStats(sellerFeedback),
            buyer: calculateStats(buyerFeedback)
        });
    } catch (error) {
        logger.error('Error fetching feedback summary', {
            error: error.message,
            stack: error.stack
        });
        res.status(500).json({ status: 'error', message: 'Failed to fetch feedback summary' });
    }
};