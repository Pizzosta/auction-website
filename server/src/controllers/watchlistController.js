import prisma from '../config/prisma.js';
import logger from '../utils/logger.js';

// Add auction to user's watchlist
export const addToWatchlist = async (req, res) => {
  try {
    const userId = req.user.id;
    const { auctionId } = req.body;

    if (!auctionId) {
      return res.status(400).json({ status: 'error', message: 'Auction ID required' });
    }

    // Check if auction exists and is active
    const auction = await prisma.auction.findUnique({
      where: {
        id: auctionId,
        isDeleted: false
      }
    });

    if (!auction) {
      return res.status(404).json({
        status: 'error',
        message: 'Auction not found'
      });
    }

    // Check if already in watchlist (including soft-deleted)
    const existing = await prisma.watchlist.findFirst({
      where: {
        userId,
        auctionId,
      },
      select: {
        id: true,
        isDeleted: true
      }
    });

    if (existing) {
      if (!existing.isDeleted) {
        return res.status(409).json({
          status: 'error',
          message: 'Auction is already in your watchlist'
        });
      }

      // Restore if previously soft-deleted
      await prisma.watchlist.update({
        where: { id: existing.id },
        data: {
          isDeleted: false,
          deletedAt: null,
          deletedById: null
        }
      });

      logger.info('Restored to watchlist', { userId, auctionId });
      return res.status(200).json({
        status: 'success',
        message: 'Auction added to watchlist'
      });
    }

    // Create new Watchlist entry
    await prisma.watchlist.create({
      data: { userId, auctionId },
    });

    logger.info('Added to watchlist', { userId, auctionId });
    return res.status(201).json({ status: 'success', message: 'Auction added to watchlist' });
  } catch (error) {
    logger.error('Add to watchlist error', { error: error.message, stack: error.stack });
    return res.status(500).json({ status: 'error', message: 'Failed to add to watchlist' });
  }
};

// Remove auction from user's watchlist
export const removeFromWatchlist = async (req, res) => {
  try {
    const userId = req.user.id;
    const { auctionId } = req.body;

    if (!auctionId) {
      return res.status(400).json({ status: 'error', message: 'Auction ID required' });
    }

    // Soft delete the watchlist entry
    const result = await prisma.watchlist.updateMany({
      where: {
        userId,
        auctionId,
        isDeleted: false
      },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedById: userId
      }
    });

    if (result.count === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Auction not found in your watchlist'
      });
    }

    logger.info('Removed from watchlist', { userId, auctionId });
    return res.status(200).json({ status: 'success', message: 'Removed from watchlist' });
  } catch (error) {
    logger.error('Remove from watchlist error', { error: error.message, stack: error.stack, userId: req.user.id, auctionId: req.body.auctionId });
    return res.status(500).json({ status: 'error', message: 'Failed to remove from watchlist' });
  }
};

// Get user's watchlist
export const getWatchlist = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [total, items] = await Promise.all([
      prisma.watchlist.count({
        where: {
          userId,
          isDeleted: false,
          auction: {
            isDeleted: false
          }
        }
      }),
      prisma.watchlist.findMany({
        where: {
          userId,
          isDeleted: false,
          auction: {
            isDeleted: false
          }
        },
        include: {
          auction: {
            select: {
              id: true,
              title: true,
              currentPrice: true,
              endDate: true,
              status: true,
              images: true
            }
          }
        },
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' }
      })
    ]);

    return res.status(200).json({
      status: 'success',
      data: {
        items,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    logger.error('Get watchlist error', {
      error: error.message,
      stack: error.stack,
      userId: req.user.id
    });
    return res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve watchlist'
    });
  }
};

// Check if auction is in user's watchlist (heart icon state)
export const checkWatchlistStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const { auctionId } = req.params;

    if (!auctionId) {
      return res.status(400).json({
        status: 'error',
        message: 'Auction ID is required'
      });
    }

    const watchlistItem = await prisma.watchlist.findFirst({
      where: {
        userId,
        auctionId,
        isDeleted: false
      },
      select: {
        id: true,
        auction: {
          select: {
            id: true,
            title: true
          }
        }
      }
    });

    return res.status(200).json({
      status: 'success',
      data: {
        isWatching: !!watchlistItem,
        auction: watchlistItem?.auction || null
      }
    });

  } catch (error) {
    logger.error('Check watchlist status error', {
      error: error.message,
      stack: error.stack,
      userId: req.user.id,
      auctionId: req.params.auctionId
    });
    return res.status(500).json({
      status: 'error',
      message: 'Failed to check watchlist status'
    });
  }
};