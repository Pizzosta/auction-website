import logger from '../utils/logger.js';
import {
    listFeedbackPrisma,
    getFeedbackByIdPrisma,
    respondToFeedbackPrisma,
    getFeedbackSummaryPrisma,
    createFeedbackPrisma,
    getAuctionForFeedback,
    getExistingFeedback,
    updateUserRating
} from '../repositories/feedbackRepo.prisma.js';
import { processFeedbackForDisplay } from '../utils/format.js';
import { AppError } from '../middleware/errorHandler.js';

// Create feedback
export const createFeedback = async (req, res, next) => {
    try {
        const { auctionId, rating, comment, type, isAnonymous } = req.body;
        const fromUserId = req.user.id;

        // Validate rating
        if (rating < 1 || rating > 5) {
            return next(new AppError('INVALID_RATING', 'Rating must be between 1 and 5', 400));
        }

        // Get auction with related data using repository
        const auction = await getAuctionForFeedback(auctionId);

        if (!auction) {
            return next(new AppError('AUCTION_NOT_FOUND', 'Auction not found', 404));
        }

        // Validate auction status
        if (auction.status !== 'sold') {
            return next(new AppError('AUCTION_NOT_SOLD', 'Feedback can only be left for sold auctions', 400));
        }

        // Determine who is giving feedback to whom
        let toUserId;
        if (type === 'seller') {
            toUserId = auction.sellerId;
            if (auction.winnerId !== fromUserId) {
                return next(new AppError('ONLY_WINNING_BIDDER_CAN_LEAVE_SELLER_FEEDBACK', 'Only the winning bidder can leave seller feedback', 403));
            }
        } else if (type === 'buyer') {
            toUserId = auction.winnerId;
            if (auction.sellerId !== fromUserId) {
                return next(new AppError('ONLY_SELLER_CAN_LEAVE_BUYER_FEEDBACK', 'Only the seller can leave buyer feedback', 403));
            }
        } else {
            return next(new AppError('INVALID_FEEDBACK_TYPE', 'Invalid feedback type', 400));
        }

        // Check if feedback already exists using repository
        const existingFeedback = await getExistingFeedback(auctionId, fromUserId, type);

        if (existingFeedback) {
            return next(new AppError('FEEDBACK_ALREADY_SUBMITTED', 'Feedback already submitted for this auction', 400));
        }

        // Create feedback using repository
        const feedback = await createFeedbackPrisma({
            rating,
            comment,
            type,
            auctionId,
            fromUserId,
            toUserId,
            isAnonymous: !!isAnonymous
        });

        // Update user's rating
        await updateUserRating(toUserId);

        res.status(201).json(feedback);
    } catch (error) {
        logger.error('Error creating feedback', {
            error: error.message,
            userId: req.user?.id,
            stack: error.stack,
        });
        next(error);
    }
};

// Get feedback for a user
export const getUserFeedback = async (req, res, next) => {
    try {
        const { userId } = req.params;
        const {
            type,
            page = 1,
            limit = 10,
            sort = 'createdAt:desc',
            minRating,
            maxRating,
            startDate,
            endDate,
            fields
        } = req.query;

        const result = await listFeedbackPrisma({
            userId,
            type,
            page: parseInt(page),
            limit: parseInt(limit),
            sort,
            minRating: minRating ? parseInt(minRating) : undefined,
            maxRating: maxRating ? parseInt(maxRating) : undefined,
            startDate,
            endDate,
            fields: fields ? fields.split(',').map(f => f.trim()) : undefined
        });

        // Process feedback to handle deleted users
        const processedData = processFeedbackForDisplay(result.data);

        res.status(200).json({
            status: 'success',
            pagination: result.pagination,
            data: processedData,
        });
    } catch (error) {
        logger.error('Error fetching feedback', {
            error: error.message,
            stack: error.stack,
        });
        next(error);
    }
};

// Respond to feedback
export const respondToFeedback = async (req, res, next) => {
    try {
        const { feedbackId } = req.params;
        const { response } = req.body;
        const userId = req.user.id;

        const feedback = await getFeedbackByIdPrisma(feedbackId);

        if (!feedback) {
            return next(new AppError('FEEDBACK_NOT_FOUND', 'Feedback not found', 404));
        }

        // Only the user who received the feedback can respond
        if (feedback.toUserId !== userId) {
            return next(new AppError('NOT_AUTHORIZED', 'Not authorized to respond to this feedback', 403));
        }

        const updatedFeedback = await respondToFeedbackPrisma(feedbackId, response);
        res.json(updatedFeedback);
    } catch (error) {
        logger.error('Error responding to feedback', {
            error: error.message,
            stack: error.stack,
        });
        next(error);
    }
};

// Get feedback summary for a user
export const getFeedbackSummary = async (req, res, next) => {
    try {
        const { userId } = req.params;
        const summary = await getFeedbackSummaryPrisma(userId);
        res.json(summary);
    } catch (error) {
        logger.error('Error fetching feedback summary', {
            error: error.message,
            stack: error.stack,
        });
        next(error);
    }
};

/**
 * Get all feedback sent by a specific user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Object} next - Express next middleware function
 */
export const getFeedbackSentByUser = async (req, res, next) => {
    try {
        const { userId } = req.params;
        const {
            type,
            page = 1,
            limit = 10,
            sort = 'createdAt:desc',
            minRating,
            maxRating,
            startDate,
            endDate,
            fields
        } = req.query;

        const result = await listFeedbackPrisma({
            fromUserId: userId,  // Filter by user who sent the feedback
            type,
            page: parseInt(page),
            limit: parseInt(limit),
            sort,
            minRating: minRating ? parseInt(minRating) : undefined,
            maxRating: maxRating ? parseInt(maxRating) : undefined,
            startDate,
            endDate,
            fields: fields ? fields.split(',').map(f => f.trim()) : undefined
        });

        res.status(200).json({
            status: 'success',
            pagination: result.pagination,
            data: result.data,
        });
    } catch (error) {
        logger.error('Error fetching feedback sent by user', {
            error: error.message,
            stack: error.stack,
            userId: req.params.userId,
            user: req.user?.id
        });
        next(error);
    }
};