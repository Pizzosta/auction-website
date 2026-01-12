import {
  findAuction,
  findWatchlist,
  createWatchlist,
  restoreWatchlist,
  softDeleteWatchlist,
  getUserWatchlist,
  checkWatchlist,
} from '../repositories/watchlistRepo.prisma.js';
import logger from '../utils/logger.js';
import { AppError } from '../middleware/errorHandler.js';
import cacheService from '../services/cacheService.js';

// Add auction to user's watchlist
export const addToWatchlist = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { auctionId } = req.body;

    if (!auctionId) {
      throw new AppError('INVALID_AUCTION_ID', 'Auction ID is required', 400);
    }

    // Check if auction exists and is active
    const auction = await findAuction(auctionId);

    if (!auction) {
      throw new AppError('AUCTION_NOT_FOUND', 'Auction not found', 404);
    }

    // Check if already in watchlist (including soft-deleted)
    const existingItem = await findWatchlist(userId, auctionId, { includeDeleted: true });

    if (existingItem) {
      if (!existingItem.isDeleted) {
        throw new AppError(
          'AUCTION_ALREADY_IN_WATCHLIST',
          'Auction is already in your watchlist',
          409
        );
      }

      // Restore if previously soft-deleted
      const restoredItem = await restoreWatchlist(existingItem.id, userId);

      logger.info('Restored to watchlist', { userId, auctionId, watchlistId: restoredItem.id });
      return res.status(200).json({
        status: 'success',
        message: 'Auction added to watchlist',
        data: {
          watchlistItem: restoredItem,
        },
      });
    }

    // Create new Watchlist entry
    const newItem = await createWatchlist(userId, auctionId);

    logger.info('Added to watchlist', { userId, auctionId, watchlistId: newItem.id });
    // Invalidate user-specific caches (my auctions / watchlist)
    try {
      await Promise.all([
        // Invalidate user's watchlist list
        cacheService.delByPrefix(`GET:/api/v1/watchlist:user:${userId}`),
        // Invalidate watchlist status check for this auction
        cacheService.del(`GET:/api/v1/watchlist/check/${auctionId}:user:${userId}`),
        // Optional: invalidate auction detail if it includes isWatching
        cacheService.del(`GET:/api/auctions/${auctionId}:user:${userId}`),
      ]);
    } catch (err) {
      logger.warn('Cache invalidation failed after addToWatchlist', { error: err?.message });
    }

    return res.status(201).json({
      status: 'success',
      message: 'Auction added to watchlist',
      data: {
        watchlistItem: newItem,
      },
    });
  } catch (error) {
    logger.error('Add to watchlist error', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      auctionId: req.body?.auctionId,
    });
    next(error);
  }
};

// Remove auction from user's watchlist
export const removeFromWatchlist = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { auctionId } = req.body;

    if (!auctionId) {
      throw new AppError('INVALID_AUCTION_ID', 'Auction ID is required', 400);
    }

    // Find the watchlist entry
    const watchlistItem = await findWatchlist(userId, auctionId);
    if (!watchlistItem) {
      throw new AppError(
        'AUCTION_NOT_FOUND_IN_WATCHLIST',
        'Auction not found in your watchlist',
        404
      );
    }

    // Soft delete the watchlist entry
    await softDeleteWatchlist(watchlistItem.id, userId);

    logger.info('Removed from watchlist', { userId, auctionId });
    // Invalidate user-specific caches
    try {
      await Promise.all([
        // Invalidate user's watchlist list
        cacheService.delByPrefix(`GET:/api/v1/watchlist:user:${userId}`),
        // Invalidate watchlist status check for this auction
        cacheService.del(`GET:/api/v1/watchlist/check/${auctionId}:user:${userId}`),
        // Optional: invalidate auction detail if it includes isWatching
        cacheService.del(`GET:/api/v1/auctions/${auctionId}:user:${userId}`),
      ]);
    } catch (err) {
      logger.warn('Cache invalidation failed after removeFromWatchlistt', { error: err?.message });
    }

    return res.status(200).json({ status: 'success', message: 'Removed from watchlist' });
  } catch (error) {
    logger.error('Remove from watchlist error', {
      error: error.message,
      stack: error.stack,
      userId: req.user.id,
      auctionId: req.body.auctionId,
    });
    next(error);
  }
};

// Get user's watchlist
export const getWatchlist = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Try per-user cache first
    try {
      const cached = await cacheService.cacheGetPerUser(req);
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        res.locals.cacheTtl = typeof cached._meta?.ttl === 'number' ? cached._meta.ttl : undefined;
        return res.status(cached.status || 200).json(cached.body);
      }
    } catch (error) {
      logger.warn('Per-user cache retrieval error in getWatchlist:', { error: error.message });
    }

    const { page = 1, limit = 10, status, sort = 'newest' } = req.query;

    const result = await getUserWatchlist(userId, { page, limit, status, sort });

    res.status(200).json({
      status: 'success',
      data: {
        pagination: result.pagination,
        items: result.data,
      },
    });

    // Cache it
    try {
      const payload = {
        status: 200,
        body: {
          status: 'success',
          data: { pagination: result.pagination, items: result.data },
        },
        _meta: { ttl: 300 },
      };
      await cacheService.cacheSetPerUser(req, payload, 300); // 5 minutes
    } catch (err) {}
  } catch (error) {
    logger.error('Get watchlist error', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
    });
    next(error);
  }
};

// Check if auction is in user's watchlist (heart icon state)
export const checkWatchlistStatus = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { auctionId } = req.params;

    // Try per-user cache first
    try {
      const cached = await cacheService.cacheGetPerUser(req);
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        res.locals.cacheTtl = typeof cached._meta?.ttl === 'number' ? cached._meta.ttl : undefined;
        return res.status(cached.status || 200).json(cached.body);
      }
    } catch (error) {
      logger.warn('Per-user cache retrieval error in checkWatchlistStatus:', {
        error: error.message,
      });
    }

    if (!auctionId) {
      throw new AppError('INVALID_AUCTION_ID', 'Auction ID is required', 400);
    }

    const watchlistItem = await checkWatchlist(userId, auctionId);

    return res.status(200).json({
      status: 'success',
      data: {
        isWatching: !!watchlistItem,
        createdAt: watchlistItem?.createdAt || null,
        auction: watchlistItem?.auction || null,
      },
    });
  } catch (error) {
    logger.error('Check watchlist status error', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      auctionId: req.params.auctionId,
    });
    next(error);
  }
};

// Toggle watchlist status (add/remove in one endpoint)
export const toggleWatchlist = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { auctionId } = req.body;

    // Input validation (Business Logic)
    if (!auctionId) {
      throw new AppError('INVALID_AUCTION_ID', 'Auction ID is required', 400);
    }

    // Check if auction exists
    const auction = await findAuction(auctionId);
    if (!auction) {
      throw new AppError('AUCTION_NOT_FOUND', 'Auction not found or inactive', 404);
    }

    // Check current status (include soft-deleted to check for restoration)
    const existingItem = await findWatchlist(userId, auctionId, {
      includeDeleted: true,
    });

    let action;
    let result;

    if (existingItem && !existingItem.isDeleted) {
      // Remove from watchlist - item exists and is not deleted
      await softDeleteWatchlist(existingItem.id, userId);
      action = 'removed';
      result = { isWatching: false };
    } else if (existingItem && existingItem.isDeleted) {
      // Restore soft-deleted item
      const restoredItem = await restoreWatchlist(existingItem.id);
      action = 'added';
      result = {
        isWatching: true,
        watchlistItem: restoredItem,
      };
    } else {
      // Create new watchlist item
      const newItem = await createWatchlist(userId, auctionId);
      action = 'added';
      result = {
        isWatching: true,
        watchlistItem: newItem,
      };
    }

    logger.info('Toggled watchlist', {
      userId,
      auctionId,
      action,
    });

    // Invalidate caches affected by watchlist toggle
    try {
      await Promise.all([
        cacheService.delByPrefix(`GET:/api/watchlist:user:${userId}`),
        cacheService.del(`GET:/api/watchlist/check/${auctionId}:user:${userId}`),
        cacheService.del(`GET:/api/auctions/${auctionId}:user:${userId}`),
      ]);
    } catch (err) {
      logger.warn('Cache invalidation failed after toggleWatchlist', { error: err?.message });
    }

    const message =
      action === 'added' ? 'Auction added to watchlist' : 'Auction removed from watchlist';
    return res.status(200).json({
      status: 'success',
      message,
      data: result,
    });
  } catch (error) {
    logger.error('Toggle watchlist error', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      auctionId: req.body?.auctionId,
    });

    next(error);
  }
};
