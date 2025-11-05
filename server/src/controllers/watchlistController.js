import {
  findAuction,
  findWatchlist,
  createWatchlist,
  restoreWatchlist,
  softDeleteWatchlist,
  getUserWatchlist,
  checkWatchlist
} from '../repositories/watchlistRepo.prisma.js';
import logger from '../utils/logger.js';

// Add auction to user's watchlist
export const addToWatchlist = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { auctionId } = req.body;

    if (!auctionId) {
      return res.status(400).json({ status: 'error', message: 'Auction ID required' });
    }

    // Check if auction exists and is active
    const auction = await findAuction(auctionId)

    if (!auction) {
      return res.status(404).json({
        status: 'error',
        message: 'Auction not found'
      });
    }

    // Check if already in watchlist (including soft-deleted)
    const existingItem = await findWatchlist(userId, auctionId, { includeDeleted: true });

    if (existingItem) {
      if (!existingItem.isDeleted) {
        return res.status(409).json({
          status: 'error',
          message: 'Auction is already in your watchlist'
        });
      }

      // Restore if previously soft-deleted
      const restoredItem = await restoreWatchlist(existingItem.id, userId);

      logger.info('Restored to watchlist', { userId, auctionId, watchlistId: restoredItem.id });
      return res.status(200).json({
        status: 'success',
        message: 'Auction added to watchlist',
        data: {
          watchlistItem: restoredItem
        }
      });
    }

    // Create new Watchlist entry
    const newItem = await createWatchlist(userId, auctionId);

    logger.info('Added to watchlist', { userId, auctionId, watchlistId: newItem.id });
    return res.status(201).json({
      status: 'success',
      message: 'Auction added to watchlist',
      data: {
        watchlistItem: newItem
      }
    });
  } catch (error) {
    logger.error('Add to watchlist error', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      auctionId: req.body?.auctionId
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
      return res.status(400).json({ status: 'error', message: 'Auction ID required' });
    }

    // Find the watchlist entry
    const watchlistItem = await findWatchlist(userId, auctionId);
    if (!watchlistItem) {
      return res.status(404).json({
        status: 'error',
        message: 'Auction not found in your watchlist'
      });
    }

    // Soft delete the watchlist entry
    await softDeleteWatchlist(watchlistItem.id, userId);

    logger.info('Removed from watchlist', { userId, auctionId });
    return res.status(200).json({ status: 'success', message: 'Removed from watchlist' });
  } catch (error) {
    logger.error('Remove from watchlist error', { error: error.message, stack: error.stack, userId: req.user.id, auctionId: req.body.auctionId });
    next(error);
  }
};

// Get user's watchlist
export const getWatchlist = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { page = 1,
      limit = 10,
      status,
      sort = 'newest' } = req.query;

    const result = await getUserWatchlist(userId, { page, limit, status, sort });

    return res.status(200).json({
      status: 'success',
      data: {
        pagination: result.pagination,
        items: result.data,
      }
    });

  } catch (error) {
    logger.error('Get watchlist error', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id
    });
    next(error);
  }
};

// Check if auction is in user's watchlist (heart icon state)
export const checkWatchlistStatus = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { auctionId } = req.params;

    if (!auctionId) {
      return res.status(400).json({
        status: 'error',
        message: 'Auction ID is required'
      });
    }

    const watchlistItem = await checkWatchlist(userId, auctionId);

    return res.status(200).json({
      status: 'success',
      data: {
        isWatching: !!watchlistItem,
        createdAt: watchlistItem?.createdAt || null,
        auction: watchlistItem?.auction || null
      }
    });

  } catch (error) {
    logger.error('Check watchlist status error', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      auctionId: req.params.auctionId
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
      return res.status(400).json({ 
        status: 'error', 
        message: 'Auction ID is required' 
      });
    }

    // Check if auction exists
    const auction = await findAuction(auctionId);
    if (!auction) {
      return res.status(404).json({
        status: 'error',
        message: 'Auction not found or inactive'
      });
    }

    // Check current status (include soft-deleted to check for restoration)
    const existingItem = await findWatchlist(userId, auctionId, { 
      includeDeleted: true 
    });

    let action, result;

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
        watchlistItem: restoredItem 
      };
    } else {
      // Create new watchlist item
      const newItem = await createWatchlist(userId, auctionId);
      action = 'added';
      result = { 
        isWatching: true, 
        watchlistItem: newItem 
      };
    }

    logger.info('Toggled watchlist', { 
      userId, 
      auctionId, 
      action 
    });

    return res.status(200).json({
      status: 'success',
      message: `Auction ${action} from watchlist`,
      data: result
    });

  } catch (error) {
    logger.error('Toggle watchlist error', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      auctionId: req.body?.auctionId
    });
    
    next(error);
  }
};