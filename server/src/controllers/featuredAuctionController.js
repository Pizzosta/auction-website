import prisma from '../config/prisma.js';
import logger from '../utils/logger.js';

// Only admin users can add/remove featured auctions
export const addFeaturedAuction = async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Admins only' });
    }
    const { auctionId } = req.body;
    const exists = await prisma.featuredAuction.findUnique({ where: { auctionId } });
    if (exists) {
      return res.status(409).json({ error: 'Auction already featured' });
    }
    const featured = await prisma.featuredAuction.create({
      data: {
        auctionId,
        addedById: req.user.id,
      },
    });
    logger.info('Added featured auction', { auctionId, addedBy: req.user.id });
    return res.status(201).json({ status: 'success', data: featured });
  } catch (err) {
    logger.error('Error adding featured auction', { error: err.message, stack: err.stack });
    next(err);
  }
};

export const removeFeaturedAuction = async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ status: 'error', error: 'Forbidden: Admins only' });
    }
    const { auctionId } = req.body;
    if (!auctionId) {
      return res.status(400).json({ status: 'error', message: 'Auction ID required' });
    }
    const getPermanentValue = value => {
      if (value == null) return false;
      if (typeof value === 'string') return value.toLowerCase() === 'true';
      return !!value;
    };
    // Accept permanent from query string (?permanent=true) and fallback to body for backward compatibility
    const permanent =
      getPermanentValue(req.query?.permanent) || getPermanentValue(req.body?.permanent);

    const featured = await prisma.featuredAuction.findUnique({
      where: { auctionId },
    });
    if (!featured) {
      return res.status(404).json({ status: 'error', error: 'Featured auction not found' });
    }
    if (featured.isDeleted) {
      return res.status(404).json({ status: 'error', error: 'Featured auction already deleted' });
    }
    if (permanent) {
      await prisma.featuredAuction.delete({ where: { auctionId } });
    } else {
      await prisma.featuredAuction.update({
        where: { auctionId },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
          deletedById: req.user.id,
        },
      });
    }

    logger.info('Featured auction removed', {
      auctionId,
      permanent,
      deletedById: req.user.id,
    });
    res.status(200).json({
      status: 'success',
      message: permanent
        ? 'Auction permanently removed from featured list'
        : 'Auction soft deleted from featured list',
    });
  } catch (err) {
    logger.error('Error removing featured auction', {
      error: err.message,
      stack: err.stack,
      auctionId: req.body?.auctionId,
      permanent: req.query?.permanent,
    });
    next(err);
  }
};

export const getFeaturedAuctions = async (req, res, next) => {
  try {
    const featured = await prisma.featuredAuction.findMany({
      where: { isDeleted: false },
      include: { auction: true, addedBy: { select: { id: true, username: true } } },
      orderBy: { createdAt: 'desc' },
    });
    if (!featured || featured.length === 0) {
      return res.status(200).json({ status: 'success', message: 'No featured auctions' });
    }
    return res.status(200).json({ status: 'success', data: featured });
  } catch (err) {
    logger.error('Error fetching featured auctions', { error: err.message, stack: err.stack });
    next(err);
  }
};
