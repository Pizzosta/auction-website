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
      status: 'success',
      message: 'Auction created successfully',
      data: createdAuction,
    });

    // Invalidate ALL auction listings + per-user
    try {
      await Promise.all([
        cacheService.delByPrefix('GET:/api/v1/auctions'),
        cacheService.delByPrefix('GET:/api/v1/auctions/me'),
        cacheService.delByPrefix('GET:/api/v1/auctions/admin-auctions'),
        cacheService.delByPrefix('GET:/api/v1/auctions/admin'),
      ]);
    } catch (err) {
      logger.warn('Cache invalidation failed after create', { error: err.message });
    }
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
    // Try to serve from cache for public listing
    try {
      const cached = await cacheService.get(req);
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        res.locals.cacheTtl = typeof cached._meta?.ttl === 'number' ? cached._meta.ttl : undefined;
        return res.status(cached.status || 200).json(cached.body);
      }
    } catch (error) {
      logger.warn('Cache retrieval error in getAuctions:', { error: error.message });
    }

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

    // Cache the successful response (best-effort)
    try {
      const payload = { status: 200, body: { status: 'success', pagination, data: auctions } };
      await cacheService.set(req, payload, 60);
    } catch (err) {}
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

    // Try per-user cache first
    try {
      const cached = await cacheService.cacheGetPerUser(req);
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        res.locals.cacheTtl = typeof cached._meta?.ttl === 'number' ? cached._meta.ttl : undefined;
        return res.status(cached.status || 200).json(cached.body);
      }
    } catch (error) {
      logger.warn('Per-user cache retrieval error in getMyAuctions:', { error: error.message });
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

    // Cache per-user auctions list (user-specific key)
    try {
      const payload = {
        status: 200,
        body: { status: 'success', pagination, data: auctions },
        _meta: { ttl: 120 },
      };
      await cacheService.cacheSetPerUser(req, payload, 120);
    } catch (err) {}
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
    // Try cached response for admin-auctions (public listing variation)
    try {
      const cached = await cacheService.get(req);
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        res.locals.cacheTtl = typeof cached._meta?.ttl === 'number' ? cached._meta.ttl : undefined;
        return res.status(cached.status || 200).json(cached.body);
      }
    } catch (error) {
      logger.warn('Cache retrieval error in getAdminAuctions:', { error: error.message });
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

    try {
      const payload = { status: 200, body: { status: 'success', pagination, data: auctions } };
      await cacheService.set(req, payload, 60);
    } catch (err) {}
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

    // Try cache first
    try {
      const cached = await cacheService.get(req);
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        res.locals.cacheTtl = typeof cached._meta?.ttl === 'number' ? cached._meta.ttl : undefined;
        return res.status(cached.status || 200).json(cached.body);
      }
    } catch (err) {}

    const auction = await findAuctionById(auctionId, {
      includeSeller: true,
      includeWinner: true,
    });

    if (!auction) {
      throw new AppError('AUCTION_NOT_FOUND', 'Auction not found', 404);
    }

    res.status(200).json({ status: 'success', data: { ...auction } });
    // Cache the auction detail (longer TTL)
    try {
      const payload = { status: 200, body: { status: 'success', data: { ...auction } } };
      await cacheService.set(req, payload, 300);
    } catch (err) {}
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
      success: 'success',
      message: 'Auction updated successfully',
      data: updatedAuction,
    });
    // Invalidate: specific auction + all listings + user's my auctions
    try {
      await Promise.all([
        cacheService.del(`GET:/api/v1/auctions/${auctionId}`),
        cacheService.delByPrefix('GET:/api/v1/auctions'),
        cacheService.delByPrefix(`GET:/api/v1/auctions/me:user:${actorId}`),
        cacheService.delByPrefix('GET:/api/v1/auctions/admin-auctions'),
        cacheService.delByPrefix('GET:/api/v1/auctions/admin'),
      ]);
    } catch (err) {
      logger.warn('Cache invalidation failed after update', { error: err.message });
    }
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
    // Invalidate cache for auctions after deletion
    try {
      await Promise.all([
        cacheService.del(`GET:/api/v1/auctions/${auctionId}`),
        cacheService.delByPrefix('GET:/api/v1/auctions'),
        cacheService.delByPrefix('GET:/api/v1/auctions/me'),
        cacheService.delByPrefix('GET:/api/v1/auctions/admin-auctions'),
        cacheService.delByPrefix('GET:/api/v1/auctions/admin'),
      ]);
    } catch (err) {
      logger.warn('Cache invalidation failed after delete', { error: err.message });
    }

    res.status(200).json({
      status: 'success',
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
      status: 'success',
      message: 'Auction has been restored successfully',
      data: { id: auctionId },
    });

    // Invalidate all listings (auction now visible again)
    try {
      await Promise.all([
        cacheService.delByPrefix('GET:/api/v1/auctions'),
        cacheService.delByPrefix('GET:/api/v1/auctions/me'),
        cacheService.delByPrefix('GET:/api/v1/auctions/admin'),
      ]);
    } catch (err) {
      logger.warn('Cache invalidation failed after restore', { error: err.message });
    }
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

    // Invalidate detail + listings (status/visual may change)
    try {
      await Promise.all([
        cacheService.del(`GET:/api/v1/auctions/${auctionId}`),
        cacheService.delByPrefix('GET:/api/v1/auctions'),
        cacheService.delByPrefix('GET:/api/v1/auctions/me'),
      ]);
    } catch (err) {}
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

    // Invalidate heavily — status changed to completed
    try {
      await Promise.all([
        cacheService.del(`GET:/api/v1/auctions/${auctionId}`),
        cacheService.delByPrefix('GET:/api/v1/auctions'),
        cacheService.delByPrefix('GET:/api/v1/auctions/me'),
        cacheService.delByPrefix('GET:/api/v1/auctions/admin'),
      ]);
    } catch (err) {}
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
