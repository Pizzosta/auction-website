import logger from '../utils/logger.js';
import {
  findFeaturedAuctionByIdPrisma,
  findFeaturedAuctionsPrisma,
  createFeaturedAuctionPrisma,
  softDeleteFeaturedAuctionPrisma,
  deleteFeaturedAuctionPrisma,
  restoreFeaturedAuctionPrisma,
} from '../repositories/featuredAuctionRepo.prisma.js';
import { findAuctionById } from '../repositories/auctionRepo.prisma.js';
import { AppError } from '../middleware/errorHandler.js';

// Only admin users can add/remove featured auctions
/**
 * @desc    Add an auction to featured list
 * @route   POST /api/featured
 * @access  Private/Admin
 */
export const addFeaturedAuction = async (req, res, next) => {
  try {
    const { role } = req.user;
    const { auctionId } = req.body;
    const actorId = req.user?.id?.toString();

    if (role !== 'admin') {
      throw new AppError('NOT_AUTHORIZED', 'Forbidden: Admins only', 403);
    }

    if (!auctionId) {
      throw new AppError('INVALID_AUCTION_ID', 'Auction ID is required', 400);
    }

    // Check if auction is already featured
    const exists = await findFeaturedAuctionByIdPrisma(auctionId, { includeAuction: false });
    if (exists) {
      if (exists.isDeleted) {
        throw new AppError(
          'AUCTION_ALREADY_FEATURED',
          'Auction was previously featured and is soft deleted. Please restore it instead.',
          409
        );
      }
      throw new AppError('AUCTION_ALREADY_FEATURED', 'Auction is already featured', 409);
    }

    // Verify auction exists and is in a valid state
    const auction = await findAuctionById(auctionId);
    if (!auction || !['upcoming', 'active'].includes(auction.status)) {
      throw new AppError(
        'INVALID_AUCTION_STATUS',
        'Only upcoming or active auctions can be featured',
        400
      );
    }

    // Create the featured auction
    const featured = await createFeaturedAuctionPrisma(auctionId, actorId);

    logger.info('Added featured auction', {
      auctionId,
      addedBy: actorId,
      featuredId: featured.id,
    });

    return res.status(201).json({
      status: 'success',
      data: featured,
    });
  } catch (error) {
    logger.error('Error adding featured auction', {
      error: error.message,
      stack: error.stack,
      auctionId: req.body?.auctionId,
      userId: req.user?.id,
    });
    next(error);
  }
};

/**
 * @desc    Remove an auction from featured list (soft delete by default, permanent for admins)
 * @route   DELETE /api/featured/remove
 * @access  Private/Admin
 */
export const removeFeaturedAuction = async (req, res, next) => {
  try {
    const { role } = req.user;
    const { auctionId } = req.body;
    const actorId = req.user?.id?.toString();

    // Helper function to parse boolean values from query/body
    const getPermanentValue = value => {
      if (value == null) return false;
      if (typeof value === 'string') return value.toLowerCase() === 'true';
      return !!value;
    };
    // Accept permanent from query string (?permanent=true) and fallback to body for backward compatibility
    const permanent =
      getPermanentValue(req.query?.permanent) || getPermanentValue(req.body?.permanent);

    // Authorization check
    if (role !== 'admin') {
      throw new AppError('NOT_AUTHORIZED', 'Forbidden: Admins only', 403);
    }

    // Input validation
    if (!auctionId) {
      throw new AppError('INVALID_AUCTION_ID', 'Auction ID is required', 400);
    }

    // Check if featured auction exists
    const featured = await findFeaturedAuctionByIdPrisma(auctionId, {
      includeAuction: false,
      includeDeletedBy: true,
    });

    if (!featured) {
      throw new AppError('FEATURED_AUCTION_NOT_FOUND', 'Featured auction not found', 404);
    }

    if (featured.isDeleted && !permanent) {
      throw new AppError(
        'FEATURED_AUCTION_ALREADY_DELETED',
        'Featured auction is already soft deleted. Use permanent=true to delete permanently.',
        400
      );
    }

    // Perform deletion based on type
    if (permanent) {
      await deleteFeaturedAuctionPrisma(auctionId);
    } else {
      await softDeleteFeaturedAuctionPrisma(auctionId, actorId);
    }

    logger.info('Featured auction removed', {
      auctionId,
      permanent,
      deletedById: actorId,
      timestamp: new Date().toISOString(),
    });

    res.status(200).json({
      status: 'success',
      message: permanent
        ? 'Auction permanently removed from featured list'
        : 'Auction soft deleted from featured list',
      data: {
        auctionId,
        deletedAt: permanent ? new Date().toISOString() : undefined,
        deletedBy: permanent ? actorId : undefined,
        isPermanent: permanent,
      },
    });
  } catch (error) {
    logger.error('Error removing featured auction', {
      error: error.message,
      stack: error.stack,
      auctionId: req.body?.auctionId,
      permanent: req.query?.permanent,
      userId: req.user?.id,
    });
    next(error);
  }
};

/**
 * @desc    Get all featured auctions with pagination and filtering
 * @route   GET /api/featured
 * @access  Public
 * @query   {number} [page=1] - Page number
 * @query   {number} [limit=10] - Items per page
 * @query   {string} [sort=newest] - Sort field and direction (field:asc|desc)
 * @query   {boolean} [includeDeleted=false] - Include soft-deleted items (admin only)
 */
export const getFeaturedAuctions = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, sort = 'newest', status } = req.query;

    const isAdmin = req.user?.role === 'admin';

    // Only admins can see soft-deleted auctions
    if ((status === 'deleted' || status === 'all') && !isAdmin) {
      throw new AppError('NOT_AUTHORIZED', 'Only admins can view deleted auctions', 403);
    }

    // Get featured auctions with pagination
    const result = await findFeaturedAuctionsPrisma({
      page: parseInt(page),
      limit: parseInt(limit),
      sort,
      status,
      includeAuction: true,
      includeAddedBy: true,
    });

    // Format response
    const response = {
      status: 'success',
      pagination: result.pagination,
      data: result.data,
    };

    if (result.data.length === 0) {
      response.message = 'No featured auctions found';
      if (status === 'all') {
        response.message = 'No featured auctions found (including deleted)';
      }
    }
    return res.status(200).json(response);
  } catch (error) {
    logger.error('Error fetching featured auctions', {
      error: error.message,
      stack: error.stack,
      query: req.query,
      userId: req.user?.id,
    });
    next(error);
  }
};

// @desc    Get public featured auctions
// @route   GET /api/featured
// @access  Public
export const getPublicFeaturedAuctions = async (req, res, next) => {
  // If user is trying to access admin-only statuses without being an admin
  if (['deleted', 'all'].includes(req.query.status)) {
    throw new AppError('NOT_AUTHORIZED', 'Only admins can view deleted auctions', 403);
  }

  // Force public endpoint to show only active auctions
  req.query.status = req.query.status || 'active'; // always filter to active

  // If no restricted status is being accessed, continue with normal auction fetching
  return getFeaturedAuctions(req, res, next);
};

// @desc    Restore a soft-deleted featured auction
// @route   PATCH /api/featured/restore
// @access  Private/Admin
export const restoreFeaturedAuction = async (req, res, next) => {
  try {
    const { role } = req.user;
    const { auctionId } = req.body;
    const actorId = req.user?.id?.toString();

    // Authorization check
    if (role !== 'admin') {
      throw new AppError('NOT_AUTHORIZED', 'Forbidden: Admins only', 403);
    }

    // Input validation
    if (!auctionId) {
      throw new AppError('INVALID_AUCTION_ID', 'Auction ID is required', 400);
    }

    // Verify auction is in a valid state to be featured
    const auction = await findAuctionById(auctionId);
    if (!auction || !['upcoming', 'active'].includes(auction.status)) {
      throw new AppError(
        'INVALID_AUCTION_STATUS',
        'Only upcoming or active auctions can be restored to featured list',
        400
      );
    }

    // Check if featured auction exists and is soft-deleted
    const featured = await findFeaturedAuctionByIdPrisma(auctionId, {
      includeAuction: false,
      includeDeletedBy: true,
    });

    if (!featured) {
      throw new AppError('FEATURED_AUCTION_NOT_FOUND', 'Featured auction not found', 404);
    }

    if (!featured.isDeleted) {
      throw new AppError('FEATURED_AUCTION_NOT_DELETED', 'Featured auction is not deleted', 400);
    }

    // Restore the featured auction
    await restoreFeaturedAuctionPrisma(auctionId, actorId);

    // Log the action
    logger.info('Restored featured auction', {
      auctionId,
      restoredBy: actorId,
      restoredAt: new Date().toISOString(),
    });

    // Return success response
    return res.status(200).json({
      status: 'success',
      message: 'Featured auction restored successfully',
      data: {
        auctionId,
        restoredAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Error restoring featured auction', {
      error: error.message,
      stack: error.stack,
      auctionId: req.body?.auctionId,
      userId: req.user?.id,
    });
    next(error);
  }
};
