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
    const exists = await prisma.watchlist.findUnique({
      where: { userId_auctionId: { userId, auctionId } },
    });
    if (exists) {
      return res.status(409).json({ status: 'error', message: 'Already in watchlist' });
    }
    const entry = await prisma.watchlist.create({
      data: { userId, auctionId },
    });
    logger.info('Added to watchlist', { userId, auctionId });
    return res.status(201).json({ status: 'success', data: entry });
  } catch (error) {
    logger.error('Add to watchlist error', { error: error.message, stack: error.stack });
    return res.status(500).json({ status: 'error', message: 'Server error' });
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

    // Check if entry exists
    const entry = await prisma.watchlist.findUnique({
      where: { userId_auctionId: { userId, auctionId } },
    });

    if (!entry) {
      return res.status(404).json({ status: 'error', message: 'Auction not in watchlist' });
    }

    // Remove it
    await prisma.watchlist.delete({
      where: { userId_auctionId: { userId, auctionId } },
    });
    logger.info('Removed from watchlist', { userId, auctionId });
    return res.status(200).json({ status: 'success', message: 'Removed from watchlist' });
  } catch (error) {
    logger.error('Remove from watchlist error', { error: error.message, stack: error.stack });
    return res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// Get user's watchlist
export const getWatchlist = async (req, res) => {
  try {
    const userId = req.user.id;
    const watchlist = await prisma.watchlist.findMany({
      where: { userId },
      include: { auction: true },
    });
    if (!watchlist || watchlist.length === 0) {
      return res.status(200).json({ status: 'success', message: 'No auctions in watchlist' });
    }
    return res.status(200).json({ status: 'success', data: watchlist });
  } catch (error) {
    logger.error('Get watchlist error', { error: error.message, stack: error.stack });
    return res.status(500).json({ status: 'error', message: 'Server error' });
  }
};
