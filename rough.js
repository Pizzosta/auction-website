//auctionRoutes.js
import express from 'express';
import { protect, admin } from '../middleware/authMiddleware.js';
import { uploadAuctionImagesMiddleware } from '../middleware/uploadMiddleware.js';
import {
  createAuction,
  getPublicAuctions,
  getAuctions,
  getAdminAuctions,
  getMyAuctions,
  getAuctionById,
  updateAuction,
  deleteAuction,
  confirmPayment,
  confirmDelivery,
} from '../controllers/auctionController.js';
import { validate } from '../middleware/validationMiddleware.js';
import { auctionSchema, idSchema, auctionQuerySchema } from '../utils/validators.js';

const router = express.Router();
router.get('/', validate(auctionQuerySchema.allAuctionSearch, 'query'), getPublicAuctions);
router.get('/admin-auctions', validate(auctionQuerySchema.auctionSearch, 'query'), getAdminAuctions);
router.get('/me', protect, validate(auctionQuerySchema.auctionSearch, 'query'), getMyAuctions);
router.get(
  '/admin',
  protect,
  admin,
  validate(auctionQuerySchema.allAuctionSearch, 'query'),
  getAuctions
);
router.post(
  '/create-auction',
  protect,
  uploadAuctionImagesMiddleware,
  validate(auctionSchema.create, 'body'),
  createAuction
);
router.get(
  '/:auctionId',
  validate(idSchema('auctionId'), 'params'),
  getAuctionById
);
router.patch(
  '/:auctionId',
  protect,
  validate(idSchema('auctionId'), 'params'),
  validate(auctionSchema.update, 'body'),
  updateAuction
);
router.delete(
  '/:auctionId',
  protect,
  validate(idSchema('auctionId'), 'params'),
  validate(auctionQuerySchema.delete, 'query'),
  deleteAuction
);
router.patch(
  '/:auctionId/confirm-payment',
  protect,
  validate(idSchema('auctionId'), 'params'),
  confirmPayment
);
router.patch(
  '/:auctionId/confirm-delivery',
  protect,
  validate(idSchema('auctionId'), 'params'),
  confirmDelivery
);

export default router;

//auctionController.js
import getCloudinary from '../config/cloudinary.js';
import logger from '../utils/logger.js';
import {
  listAuctionsPrisma,
  createAuctionPrisma,
  findAuctionById,
  updateAuctionPrisma,
  softDeleteAuction,
  deleteAuctionPermanently,
  findAuctionPrisma,
  findDeletedAuction,
  restoreAuctionPrisma,
  confirmAuctionPaymentPrisma,
  confirmAuctionDeliveryPrisma,
  completeAuctionPrisma,
  checkAuctionConfirmationStatusPrisma,
} from '../repositories/auctionRepo.prisma.js';
import cacheService from '../services/cacheService.js';
import { findUserByIdPrisma } from '../repositories/userRepo.prisma.js';
import { Prisma } from '@prisma/client';
import { AppError } from '../middleware/errorHandler.js';

// @desc    Create a new auction
// @route   POST /api/v1/create-auction
// @access  Private
export const createAuction = async (req, res, next) => {
  try {
    const {
      title,
      description,
      location,
      category,
      startingPrice,
      startDate,
      endDate,
      bidIncrement,
      images,
    } = req.body;

    const sellerId = req.user?.id?.toString();
    const auctionData = {
      title,
      description,
      location,
      category,
      startingPrice,
      bidIncrement,
      startDate,
      endDate,
      status: 'upcoming',
      images,
      sellerId,
    };

    const createdAuction = await createAuctionPrisma(auctionData);

    res.status(201).json({
      success: true,
      message: 'Auction created successfully',
      data: createdAuction,
    });
  } catch (error) {
    logger.error('Error creating auction:', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      auctionData: req.body,
    });

    // Clean up uploaded files in case of error
    if (req.uploadedFiles?.length > 0) {
      try {
        const cloudinary = await getCloudinary();
        await Promise.all(
          req.uploadedFiles.map(file =>
            cloudinary.uploader.destroy(file.publicId).catch(err =>
              logger.error('Error destroying uploaded file:', {
                error: err.message,
                stack: err.stack,
                publicId: file.publicId,
              })
            )
          )
        );
      } catch (cleanupError) {
        logger.error('Error cleaning up uploaded files:', {
          error: cleanupError.message,
          stack: cleanupError.stack,
          files: req.uploadedFiles,
        });
      }
    }
    next(error);
  }
};

// @desc    Get all auctions
// @route   GET /api/v1/auctions/admin
// @access  Admin
export const getAuctions = async (req, res, next) => {
  try {
    const {
      status,
      category,
      location,
      search,
      seller,
      winner,
      minPrice,
      maxPrice,
      startDate,
      endDate,
      endingSoon,
      fields,
      page = 1,
      limit = 10,
      sort = 'createdAt',
      order = 'desc',
    } = req.query;

    const isAdmin = req.user?.role === 'admin';

    // Only admins can see soft-deleted auctions
    if ((status === 'cancelled' || status === 'all') && !isAdmin) {
      throw new AppError('NOT_AUTHORIZED', 'Only admins can view deleted auctions', 403);
    }

    if (status === 'completed' && !isAdmin) {
      throw new AppError('NOT_AUTHORIZED', 'Only admins can view completed auctions', 403);
    }

    // Use the repository to get paginated and filtered auctions
    const { data: auctions, pagination } = await listAuctionsPrisma({
      status,
      category,
      location,
      search,
      seller,
      winner,
      minPrice,
      maxPrice,
      startDate,
      endDate,
      endingSoon,
      fields: fields?.split(',').map(f => f.trim()),
      page,
      limit,
      sort,
      order,
    });

    res.status(200).json({
      status: 'success',
      pagination,
      data: auctions,
    });
  } catch (error) {
    logger.error('Error fetching auctions:', {
      error: error.message,
      stack: error.stack,
      query: req.query,
    });
    next(error);
  }
};

// @desc    Get my auctions
// @route   GET /api/v1/auctions/me
// @access  Private
export const getMyAuctions = async (req, res, next) => {
  try {
    const sellerId = req.user?.id;
    if (!sellerId) {
      throw new AppError('AUTH_REQUIRED', 'Authentication required', 401);
    }
    const {
      status,
      category,
      location,
      search,
      minPrice,
      maxPrice,
      startDate,
      endDate,
      endingSoon,
      fields,
      page = 1,
      limit = 10,
      sort = 'createdAt',
      order = 'desc',
    } = req.query;
    const { data: auctions, pagination } = await listAuctionsPrisma({
      status,
      category,
      location,
      search,
      seller: sellerId,
      minPrice,
      maxPrice,
      startDate,
      endDate,
      endingSoon,
      fields: fields?.split(',').map(f => f.trim()),
      page,
      limit,
      sort,
      order,
    });
    res.status(200).json({ status: 'success', pagination, data: auctions });
  } catch (error) {
    logger.error('Error fetching my auctions:', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
    });
    next(error);
  }
};

// @desc    Get all auctions created by admins
// @route   GET /api/v1/auctions/admin-auctions
// @access  public
export const getAdminAuctions = async (req, res, next) => {
  try {
    const {
      status,
      category,
      location,
      search,
      minPrice,
      maxPrice,
      startDate,
      endDate,
      endingSoon,
      fields,
      page = 1,
      limit = 10,
      sort = 'createdAt',
      order = 'desc',
    } = req.query;

    const isAdmin = req.user?.role === 'admin';

    // Only admins can see soft-deleted auctions
    if ((status === 'cancelled' || status === 'all') && !isAdmin) {
      throw new AppError('NOT_AUTHORIZED', 'Only admins can view deleted auctions', 403);
    }

    if (status === 'completed' && !isAdmin) {
      throw new AppError('NOT_AUTHORIZED', 'Only admins can view completed auctions', 403);
    }

    // Only auctions where the seller is an admin
    const { data: auctions, pagination } = await listAuctionsPrisma({
      status,
      category,
      location,
      search,
      role: isAdmin,
      minPrice,
      maxPrice,
      startDate,
      endDate,
      endingSoon,
      fields: fields?.split(',').map(f => f.trim()),
      page,
      limit,
      sort,
      order,
    });
    res.status(200).json({ status: 'success', pagination, data: auctions });
  } catch (error) {
    next(error);
  }
};

// @desc    Get public auctions
// @route   GET /api/v1/auctions
// @access  Public
export const getPublicAuctions = async (req, res, next) => {
  // If user is trying to access admin-only statuses without being an admin
  if (['cancelled', 'all'].includes(req.query.status)) {
    throw new AppError(
      'AUTHENTICATION_REQUIRED',
      'Authentication required to view these auctions',
      401
    );
  }

  // If no restricted status is being accessed, continue with normal auction fetching
  return getAuctions(req, res, next);
};

export const getAuctionById = async (req, res, next) => {
  try {
    const { auctionId } = req.params;

    const auction = await findAuctionById(auctionId, {
      includeSeller: true,
      includeWinner: true,
    });

    if (!auction) {
      throw new AppError('AUCTION_NOT_FOUND', 'Auction not found', 404);
    }

    if (auction) {
      res.json({
        status: 'success',
        data: {
          ...auction,
        },
      });
    }
  } catch (error) {
    logger.error('Get auction by id error:', {
      error: error.message,
      stack: error.stack,
      auctionId: req.params.auctionId,
    });
    next(error);
  }
};

// @desc    Update auction
// @route   PUT /api/v1/auctions/:id
// @access  Private/Owner or Admin
export const updateAuction = async (req, res, next) => {
  try {
    const {
      title,
      description,
      startingPrice,
      bidIncrement,
      startDate,
      endDate,
      images,
      category,
      location,
    } = req.body;
    const { auctionId } = req.params;

    // Find the auction
    const auction = await findAuctionById(auctionId);
    if (!auction) {
      throw new AppError('AUCTION_NOT_FOUND', 'Auction not found', 404);
    }

    // Check if user is the owner or admin
    const actorId = req.user?.id;
    if (auction.sellerId !== actorId && req.user.role !== 'admin') {
      throw new AppError(
        'NOT_AUTHORIZED_TO_UPDATE_AUCTION',
        'Not authorized to update this auction',
        403
      );
    }

    // Check if auction has started
    if (new Date(auction.startDate) <= new Date()) {
      throw new AppError(
        'CANNOT_UPDATE_STARTED_AUCTION',
        'Cannot update an auction that has already started',
        400
      );
    }

    // Check if auction has ended
    if (new Date(auction.endDate) < new Date()) {
      throw new AppError(
        'CANNOT_UPDATE_ENDED_AUCTION',
        'Cannot update an auction that has already ended',
        400
      );
    }

    // Update fields if provided
    const updateData = {};

    if (title) updateData.title = title;
    if (description) updateData.description = description;
    if (startingPrice !== undefined) {
      updateData.startingPrice = new Prisma.Decimal(startingPrice);
      // Update currentPrice to match the new startingPrice if it's being updated
      updateData.currentPrice = new Prisma.Decimal(startingPrice);
    }
    if (bidIncrement) updateData.bidIncrement = new Prisma.Decimal(bidIncrement);
    if (startDate) updateData.startDate = new Date(startDate);
    if (endDate) updateData.endDate = new Date(endDate);
    if (category) updateData.category = category;
    if (location) updateData.location = location;

    // Handle images if provided (delete old images)
    if (images && Array.isArray(images)) {
      if (auction.images && auction.images.length > 0) {
        try {
          const cloudinary = await getCloudinary();
          await Promise.all(
            auction.images.map(async img => {
              if (img.publicId) {
                await cloudinary.uploader.destroy(img.publicId);
              }
            })
          );
        } catch (error) {
          logger.error('Error deleting old images:', {
            error: error.message,
            stack: error.stack,
            auctionId,
            userId: actorId,
          });
          // Continue with the update even if image deletion fails
        }
      }
      updateData.images = images;
    }

    // Remove any undefined, null, or empty string values
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined || updateData[key] === null || updateData[key] === '') {
        delete updateData[key];
      }
    });

    // If no valid fields remain after cleanup
    if (Object.keys(updateData).length === 0) {
      throw new AppError(
        'NO_UPDATE_DATA',
        'No updates provided. Please specify the fields you want to update.',
        400
      );
    }

    const updatedAuction = await updateAuctionPrisma(auctionId, updateData, auction.version);

    res.status(200).json({
      success: true,
      data: updatedAuction,
    });
  } catch (error) {
    if (error.code === 'P2025') {
      throw new AppError(
        'CONFLICT',
        'This auction was modified by another user. Please refresh and try again.',
        409
      );
    }
    logger.error('Update auction error:', {
      error: error.message,
      stack: error.stack,
      errorName: error.name,
      auctionId: req.params.auctionId,
      userId: req.user?.id,
    });
    next(error);
  }
};

// @desc    Delete auction
// @route   DELETE /api/v1/auctions/:id
// @access  Private/Owner or Admin
export const deleteAuction = async (req, res, next) => {
  const { auctionId } = req.params;
  const actorId = req.user?.id;

  const getPermanentValue = value => {
    if (value == null) return false;
    if (typeof value === 'string') return value.toLowerCase() === 'true';
    return !!value;
  };
  // Accept permanent from query string (?permanent=true) and fallback to body for backward compatibility
  const permanent =
    getPermanentValue(req.query?.permanent) || getPermanentValue(req.body?.permanent);

  try {
    // Find the auction with minimal required fields
    const auction = await findAuctionPrisma(auctionId);

    if (!auction) {
      throw new AppError('AUCTION_NOT_FOUND', 'Auction not found', 404);
    }

    // Check if user is the owner or admin
    if (auction.sellerId !== actorId && req.user.role !== 'admin') {
      throw new AppError('NOT_AUTHORIZED', 'Not authorized to delete this auction', 403);
    }

    // Only admins can perform permanent deletion
    if (permanent && req.user.role !== 'admin') {
      throw new AppError('NOT_AUTHORIZED', 'Only admins can permanently delete auctions', 403);
    }

    // Check if auction has started (for non-admin users)
    if (new Date(auction.startDate) <= new Date() && req.user.role !== 'admin') {
      throw new AppError(
        'CANNOT_DELETE_STARTED_AUCTION',
        'Cannot delete an auction that has already started',
        400
      );
    }

    if (permanent) {
      // Delete images from Cloudinary if they exist
      if (auction.images?.length > 0) {
        try {
          const cloudinary = await getCloudinary();
          await Promise.all(
            auction.images.map(async img => {
              if (img.publicId) {
                await cloudinary.uploader.destroy(img.publicId);
              }
            })
          );
        } catch (error) {
          logger.error('Error deleting images:', {
            error: error.message,
            stack: error.stack,
            auctionId: auction.id,
            userId: actorId,
          });
          // Continue with deletion even if image deletion fails
        }
      }

      // Permanently delete auction (cascading deletes are handled by the database)
      await deleteAuctionPermanently(auctionId, auction.version);
    } else {
      // Soft delete with version check
      const updatedAuction = await softDeleteAuction(auctionId, actorId, auction.version);

      if (!updatedAuction) {
        throw new AppError('CONFLICT', 'Failed to soft delete auction - version mismatch', 409);
      }
    }
  
    res.status(200).json({
      success: true,
      message: permanent
        ? 'Auction and all associated data have been permanently deleted'
        : 'Auction has been soft deleted',
      data: { id: auctionId },
    });
  } catch (error) {
    if (error.code === 'P2025') {
      throw new AppError(
        'CONFLICT',
        'This auction was modified by another user. Please refresh and try again.',
        409
      );
    }

    logger.error('Delete auction error:', {
      error: error.message,
      stack: error.stack,
      auctionId: req.params.auctionId,
      userId: actorId,
      permanent,
    });

    next(error);
  }
};

// @desc    Restore a soft-deleted auction (Admin only)
// @route   PATCH /api/v1/auctions/:id/restore
// @access  Private/Admin
export const restoreAuction = async (req, res, next) => {
  try {
    const { auctionId } = req.params;
    const { role } = req.user;

    // Only admins can restore auctions
    if (role !== 'admin') {
      throw new AppError('NOT_AUTHORIZED', 'Only admins can restore auctions', 403);
    }

    // Find the auction including soft-deleted ones
    const auction = await findAuctionPrisma(auctionId);

    if (!auction) {
      throw new AppError('AUCTION_NOT_FOUND', 'Auction not found', 404);
    }

    // Check if auction is not soft-deleted (we need to fetch it again with isDeleted field)
    const auctionWithDeletedStatus = await findDeletedAuction(auctionId);

    if (!auctionWithDeletedStatus.isDeleted) {
      throw new AppError('AUCTION_NOT_DELETED', 'Auction is not deleted', 400);
    }

    // Check if auction has already ended
    if (new Date(auctionWithDeletedStatus.endDate) < new Date()) {
      throw new AppError(
        'CANNOT_RESTORE_ENDED_AUCTION',
        'Cannot restore an auction that has already ended',
        400
      );
    }

    // Restore the auction
    await restoreAuctionPrisma(auctionId, auction.version);

    res.status(200).json({
      success: true,
      message: 'Auction has been restored successfully',
      data: { id: auctionId },
    });
  } catch (error) {
    if (error.code === 'P2025') {
      throw new AppError(
        'CONFLICT',
        'This auction was modified by another user. Please refresh and try again.',
        409
      );
    }

    logger.error('Restore auction error:', {
      error: error.message,
      stack: error.stack,
      auctionId: req.params.auctionId,
      userId: req.user?.id,
    });

    next(error);
  }
};

// @desc    Confirm payment for an auction (Seller confirms they received payment)
// @route   PATCH /api/v1/auctions/:id/confirm-payment
// @access  Private/Seller or Admin
export const confirmPayment = async (req, res, next) => {
  try {
    const { auctionId } = req.params;
    const userId = req.user.id;

    // Fetch the user with only necessary fields
    const user = await findUserByIdPrisma(userId, ['id', 'role'], { allowSensitive: false });

    if (!user) {
      throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    }

    const auction = await findAuctionById(auctionId, {
      includeSeller: true,
      includeWinner: true,
    });

    if (!auction) {
      throw new AppError('AUCTION_NOT_FOUND', 'Auction not found', 404);
    }

    if (auction.status !== 'sold') {
      throw new AppError('AUCTION_NOT_SOLD', 'Auction is not sold yet', 400);
    }

    // Only the seller or admin can confirm payment
    if (auction.sellerId !== userId && user.role !== 'admin') {
      throw new AppError(
        'NOT_AUTHORIZED',
        'Not authorized to confirm payment for this auction',
        403
      );
    }

    // Check if auction has ended
    if (new Date(auction.endDate) > new Date()) {
      throw new AppError(
        'CANNOT_CONFIRM_PAYMENT_FOR_NOT_ENDED_AUCTION',
        'Cannot confirm payment for an auction that has not ended',
        400
      );
    }

    if (auction.isPaymentConfirmed) {
      throw new AppError('PAYMENT_ALREADY_CONFIRMED', 'Payment is already confirmed', 400);
    }

    // Confirm payment
    await confirmAuctionPaymentPrisma(auctionId, userId, auction.version);

    res.status(200).json({
      status: 'success',
      message: 'Payment confirmed successfully',
      data: { id: auctionId },
    });
  } catch (error) {
    if (error.code === 'P2025') {
      throw new AppError(
        'CONFLICT',
        'This auction was modified by another user. Please refresh and try again.',
        409
      );
    }
    logger.error('Confirm payment error:', {
      error: error.message,
      stack: error.stack,
      auctionId: req.params.auctionId,
      userId: req.user?.id,
    });
    next(error);
  }
};

// @desc    Confirm delivery for an auction (Winner confirms they received the item)
// @route   PATCH /api/v1/auctions/:id/confirm-delivery
// @access  Private/Winner or Admin
export const confirmDelivery = async (req, res, next) => {
  try {
    const { auctionId } = req.params;
    const userId = req.user.id;

    // Fetch the user with only necessary fields
    const user = await findUserByIdPrisma(userId, ['id', 'role'], { allowSensitive: false });

    if (!user) {
      throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    }

    const auction = await findAuctionById(auctionId, {
      includeSeller: true,
      includeWinner: true,
    });

    if (!auction) {
      throw new AppError('AUCTION_NOT_FOUND', 'Auction not found', 404);
    }

    if (auction.status !== 'sold') {
      throw new AppError('AUCTION_NOT_SOLD', 'Auction is not sold yet', 400);
    }

    if (!auction.isPaymentConfirmed) {
      throw new AppError(
        'PAYMENT_NOT_CONFIRMED',
        'Payment must be confirmed before delivery can be confirmed',
        400
      );
    }

    if (auction.isDeliveryConfirmed) {
      throw new AppError('DELIVERY_ALREADY_CONFIRMED', 'Delivery is already confirmed', 400);
    }

    // Only the winner or admin can confirm delivery
    if (auction.winnerId !== userId && user.role !== 'admin') {
      throw new AppError(
        'NOT_AUTHORIZED_TO_CONFIRM_DELIVERY',
        'Not authorized to confirm delivery for this auction',
        403
      );
    }

    // Check if auction has ended
    if (new Date(auction.endDate) > new Date()) {
      throw new AppError(
        'CANNOT_CONFIRM_DELIVERY_FOR_NOT_ENDED_AUCTION',
        'Cannot confirm delivery for an auction that has not ended',
        400
      );
    }

    // Confirm delivery
    await confirmAuctionDeliveryPrisma(auctionId, userId, auction.version);

    // Check confirmation status
    const confirmationStatus = await checkAuctionConfirmationStatusPrisma(auctionId);

    if (!confirmationStatus) {
      throw new AppError('AUCTION_NOT_FOUND', 'Auction not found after delivery confirmation', 404);
    }

    // Update status to completed if both payment and delivery are confirmed
    if (confirmationStatus.isPaymentConfirmed && confirmationStatus.isDeliveryConfirmed) {
      await completeAuctionPrisma(auctionId, confirmationStatus.version);
    }

    res.status(200).json({
      status: 'success',
      message: 'Delivery confirmed successfully',
      data: { id: auctionId },
    });
  } catch (error) {
    if (error.code === 'P2025') {
      throw new AppError(
        'CONFLICT',
        'This auction was modified by another user. Please refresh and try again.',
        409
      );
    }
    logger.error('Confirm delivery error:', {
      error: error.message,
      stack: error.stack,
      auctionId: req.params.auctionId,
      userId: req.user?.id,
    });
    next(error);
  }
};

//cacheHeaders.js
// Simple middleware to set Cache-Control headers for GET responses
export default function cacheHeaders(defaultTtl = 60) {
  return (req, res, next) => {
    // Only set headers for GET requests
    if (req.method !== 'GET') return next();

    // Allow route handlers to override TTL via res.locals.cacheTtl
    const ttl = typeof res.locals.cacheTtl === 'number' ? res.locals.cacheTtl : defaultTtl;

    // Public cache for anonymous responses; if Authorization header present mark as private
    const isPrivate = !!req.headers.authorization;

    const cacheControl = isPrivate
      ? `private, max-age=${ttl}, s-maxage=${Math.max(0, Math.floor(ttl / 2))}`
      : `public, max-age=${ttl}, s-maxage=${ttl}`;

    res.setHeader('Cache-Control', cacheControl);

    // Add a small Vary header to indicate responses may vary by Accept-Encoding
    res.vary && res.vary('Accept-Encoding');

    next();
  };
}

//cacheMiddleware.js
import { cacheGet, cacheSet } from '../services/cacheService.js';
import logger from '../utils/logger.js';

// Middleware to cache GET responses in Redis
// Options: ttlSeconds (default 60), skipWhenAuth (skip caching when Authorization header present)
export default function cacheMiddleware(options = {}) {
  const { ttlSeconds = 60, skipWhenAuth = true } = options;

  return async (req, res, next) => {
    try {
      if (req.method !== 'GET') return next();

      if (skipWhenAuth && req.headers.authorization) return next();

      // allow clients to opt-out with Cache-Control: no-cache or ?no_cache=1
      const noCacheHeader = (req.headers['cache-control'] || '').includes('no-cache');
      if (noCacheHeader || req.query?.no_cache === '1' || req.query?.no_cache === 'true')
        return next();

      const cacheKey = `cache:${req.originalUrl}`;
      const cached = await cacheGet(cacheKey);
      if (cached) {
        // set a header indicating served from cache
        res.setHeader('X-Cache', 'HIT');
        // Allow handlers to set TTL in locals
        res.locals.cacheTtl = typeof cached._meta?.ttl === 'number' ? cached._meta.ttl : ttlSeconds;
        return res.status(cached.status || 200).json(cached.body);
      }

      // Capture json responses
      const originalJson = res.json.bind(res);
      res.json = async body => {
        try {
          const payload = { status: res.statusCode || 200, body };
          // store meta to allow cacheHeaders middleware to set header
          payload._meta = {
            ttl: typeof res.locals.cacheTtl === 'number' ? res.locals.cacheTtl : ttlSeconds,
          };
          await cacheSet(cacheKey, payload, payload._meta.ttl || ttlSeconds);
          res.setHeader('X-Cache', 'MISS');
        } catch (err) {
          logger.warn('Failed to write cache', { error: err?.message, url: req.originalUrl });
        }
        return originalJson(body);
      };

      next();
    } catch (err) {
      logger.warn('Cache middleware error', { error: err?.message });
      return next();
    }
  };
}

//server.js
// Add cache-related headers for GET responses
import cacheHeaders from './middleware/cacheHeaders.js';
import cacheMiddleware from './middleware/cacheMiddleware.js';
import auctionRoutes from './routes/auctionRoutes.js';

app.use(cacheHeaders(60));

app.use('/api/v1/auctions', auctionRoutes);

app.use(cacheMiddleware({ ttlSeconds: 60, skipWhenAuth: true }));
{...}

const PORT = env.port || 5001;
const HOST = env.host || 'localhost';
server.listen(PORT, HOST, () => {
  logger.info(`Server running in ${env.nodeEnv} mode on port ${PORT}`);
  logger.info(`API Documentation available at: http://${HOST}:${PORT}/api/v1/docs`);
  logMemoryUsage('After server start');
});

Please apply cache to the controllers where appropriate adopting Complete Fixed Cache Utility you created earlier.


    // Invalidate related caches (public auctions listing)
    try {
      await cacheService.delByPrefix(`GET:/api/v1/auctions/me:user:${sellerId}`);
      await cacheService.delByPrefix('GET:/api/v1/auctions');
    } catch (error) {
      logger.warn('Failed to clear cache after auction creation', {
        error: error.message,
        auctionId: createdAuction.id,
        sellerId,
      });
    }


    // Invalidate auction listings and auction detail cache
    try {
      await cacheService.delByPrefix('GET:/api/v1/auctions');
      await cacheService.del(`GET:/api/v1/auctions/${auctionId}`);
    } catch (err) {}

    // Invalidate cache
    try {
      await cacheService.delByPrefix('GET:/api/v1/auctions');
      await cacheService.del(`GET:/api/v1/auctions/${auctionId}/restore`);
    } catch (err) {}

    // Invalidate cache for this auction and listings
    try {
      await cacheService.delByPrefix('GET:/api/v1/auctions');
      await cacheService.del(`GET:/api/v1/auctions/${auctionId}/confirm-payment`);
    } catch (err) {}

    // Invalidate cache for this auction and listings
    try {
      await cacheService.delByPrefix('GET:/api/v1/auctions');
      await cacheService.del(`GET:/api/v1/auctions/${auctionId}/confirm-payment`);
    } catch (err) {}

