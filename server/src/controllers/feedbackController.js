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
import { findUserByIdPrisma } from '../repositories/userRepo.prisma.js';
import { processFeedbackForDisplay } from '../utils/format.js';
import { AppError } from '../middleware/errorHandler.js';
import cacheService from '../services/cacheService.js';

// Create feedback
export const createFeedback = async (req, res, next) => {
    try {
        const { auctionId, rating, comment, isAnonymous } = req.body;
        const userId = req.user.id;

        const user = await findUserByIdPrisma(userId, ['id'], { allowSensitive: false });

        if (!user) {
            throw new AppError('USER_NOT_FOUND', 'User not found', 404);
        }

        // Get auction with related data using repository
        const auction = await getAuctionForFeedback(auctionId);

        if (!auction) {
            throw new AppError('AUCTION_NOT_FOUND', 'Auction not found', 404);
        }

        // Validate auction status
        if (auction.status !== 'completed') {
            throw new AppError('AUCTION_NOT_COMPLETED', 'Feedback can only be left for completed auctions', 400);
        }

        // Only the winner can leave feedback for the seller
        const toUserId = auction.sellerId;
        if (auction.winnerId !== userId) {
            throw new AppError('NOT_AUTHORIZED', 'Only the winning bidder can leave feedback', 403);
        }

        // Validate rating
        if (rating < 1 || rating > 5) {
            throw new AppError('INVALID_RATING', 'Rating must be between 1 and 5', 400);
        }

        // Check if feedback already exists using repository
        const existingFeedback = await getExistingFeedback(auctionId, userId);

        if (existingFeedback) {
            throw new AppError('FEEDBACK_ALREADY_SUBMITTED', 'Feedback already submitted for this auction', 409);
        }

        // Create feedback using repository
        const feedback = await createFeedbackPrisma({
            rating,
            comment,
            auctionId,
            fromUserId: userId,
            toUserId,
            isAnonymous: !!isAnonymous
        });

        // Update user's rating
        await updateUserRating(toUserId);

                // Invalidate caches affected by new feedback
                try {
                    await cacheService.delByPrefix('GET:/api/v1/auctions');
                    await cacheService.delByPrefix('GET:/api/v1/users');
                    await cacheService.delByPrefix(`GET:/api/v1/users/${toUserId}`);
                    await cacheService.delByPrefix(`GET:/api/v1/auctions/${auctionId}`);
                } catch (err) {
                    logger.warn('Cache invalidation failed after createFeedback', { error: err?.message });
                }

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
export const getReceivedFeedback = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const {
            page = 1,
            limit = 10,
            sort = 'createdAt',
            order = 'desc',
            minRating,
            maxRating,
            startDate,
            endDate,
            fields
        } = req.query;

        const user = await findUserByIdPrisma(userId, ['id'], { allowSensitive: false });

        if (!user) {
            throw new AppError('USER_NOT_FOUND', 'User not found', 404);
        }

        const result = await listFeedbackPrisma({
            toUserId: userId,
            page,
            limit,
            sort,
            order,
            minRating: minRating ? parseInt(minRating) : undefined,
            maxRating: maxRating ? parseInt(maxRating) : undefined,
            startDate,
            endDate,
            fields: fields?.split(',').map(f => f.trim())
        });

        res.status(200).json({
            status: 'success',
            pagination: result.pagination,
            data: result.data,
        });
    } catch (error) {
        logger.error('Error fetching feedback', {
            error: error.message,
            stack: error.stack,
            userId: req.user?.id,
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

        const user = await findUserByIdPrisma(userId, ['id'], { allowSensitive: false });

        if (!user) {
            throw new AppError('USER_NOT_FOUND', 'User not found', 404);
        }

        const feedback = await getFeedbackByIdPrisma(feedbackId);

        if (!feedback) {
            throw new AppError('FEEDBACK_NOT_FOUND', 'Feedback not found', 404);
        }

        if (feedback.response) {
            throw new AppError('RESPONSE_ALREADY_EXISTS', 'A response already exists for this feedback', 409);
        }

        // Only the user who received the feedback can respond
        if (feedback.toUserId !== userId) {
            throw new AppError('NOT_AUTHORIZED', 'Not authorized to respond to this feedback', 403);
        }

        if(!response){
            throw new AppError('RESPONSE_REQUIRED', 'Response is required', 400);
        }

        const updatedFeedback = await respondToFeedbackPrisma(feedbackId, response);
                // Invalidate caches that may display feedback summaries or user info
                try {
                    await cacheService.delByPrefix('GET:/api/v1/users');
                    await cacheService.delByPrefix(`GET:/api/v1/users/${feedback.toUserId}`);
                } catch (err) {
                    logger.warn('Cache invalidation failed after respondToFeedback', { error: err?.message });
                }

                res.json(updatedFeedback);
    } catch (error) {
        logger.error('Error responding to feedback', {
            error: error.message,
            stack: error.stack,
            userId: req.user?.id,
        });
        next(error);
    }
};

export const getSentFeedback = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const {
            page = 1,
            limit = 10,
            sort = 'createdAt',
            order = 'desc',
            minRating,
            maxRating,
            startDate,
            endDate,
            fields
        } = req.query;

        const user = await findUserByIdPrisma(userId, ['id'], { allowSensitive: false });

        if (!user) {
            throw new AppError('USER_NOT_FOUND', 'User not found', 404);
        }

        const result = await listFeedbackPrisma({
            fromUserId: userId,  // Filter by user who sent the feedback
            page,
            limit,
            sort,
            order,
            minRating: minRating ? parseInt(minRating) : undefined,
            maxRating: maxRating ? parseInt(maxRating) : undefined,
            startDate,
            endDate,
            fields: fields?.split(',').map(f => f.trim())
        });

        const processData = processFeedbackForDisplay(result.data);

        res.status(200).json({
            status: 'success',
            pagination: result.pagination,
            data: processData,
        });
    } catch (error) {
        logger.error('Error fetching feedback sent by user', {
            error: error.message,
            stack: error.stack,
            userId: req.user?.id
        });
        next(error);
    }
};

// Get feedback summary for a user
export const getFeedbackSummary = async (req, res, next) => {
    try {
        const userId = req.user.id;

        const user = await findUserByIdPrisma(userId, ['id'], { allowSensitive: false });

        if (!user) {
            throw new AppError('USER_NOT_FOUND', 'User not found', 404);
        }

        const summary = await getFeedbackSummaryPrisma(userId);
        res.json(summary);
    } catch (error) {
        logger.error('Error fetching feedback summary', {
            error: error.message,
            stack: error.stack,
            userId: req.user?.id,
        });
        next(error);
    }
};
