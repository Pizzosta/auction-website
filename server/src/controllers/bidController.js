import { Prisma } from '@prisma/client';
import prisma from '../config/prisma.js';
import logger from '../utils/logger.js';
import { acquireLock } from '../utils/lock.js';
import { executeRedisCommand } from '../config/redis.js';
import { listBidsPrisma, listBidsByAuctionPrisma, listAllBidsPrisma } from '../repositories/bidRepo.prisma.js';
import { addToQueue } from '../services/emailQueue.js';
import { formatCurrency, formatDateTime } from '../utils/format.js';

const updateOutbidBids = async (req, auctionId, newBidAmount, currentBidId) => {
  try {
    // Find all bids that are now outbid
    const outbidBids = await prisma.bid.findMany({
      where: {
        auctionId,
        amount: { lt: newBidAmount },
        isOutbid: false,
        id: { not: currentBidId }
      },
      include: {
        bidder: {
          select: {
            id: true,
            email: true,
            firstname: true
          }
        },
        auction: {
          select: {
            id: true,
            title: true,
            endDate: true
          }
        }
      }
    });

    if (outbidBids.length === 0) return;

    // Get the socket instance
    const io = req?.app?.get('io');

    // Update all outbid bids in a transaction
    await prisma.$transaction(async (prisma) => {
      // Update all outbid bids
      await prisma.bid.updateMany({
        where: {
          id: { in: outbidBids.map(bid => bid.id) }
        },
        data: {
          isOutbid: true,
          outbidAt: new Date()
        }
      });

      // Emit real-time notifications to outbid users
      if (io) {
        outbidBids.forEach(bid => {
          io.to(`user_${bid.bidder.id}`).emit('bid:outbid', {
            auctionId,
            bidId: bid.id,
            newBidAmount,
            outbidAt: new Date()
          });
        });
      }
    });

    // Add outbid email to queue
    for (const bid of outbidBids) {
      try {
        await addToQueue('outBid', bid.bidder.email, {
          name: bid.bidder.firstname,
          auctionTitle: bid.auction.title,
          newBidAmount: formatCurrency(newBidAmount),
          auctionUrl: `${process.env.FRONTEND_URL}/auctions/${auctionId}`,
          auctionEndDate: formatDateTime(bid.auction.endDate),
        });
        logger.info('Outbid User email queued', { userEmail: bid.bidder.email });
      } catch (error) {
        logger.error('Failed to queue outbid user email:', {
          error: error.message,
          stack: error.stack,
          userEmail: bid.bidder.email,
        });
        // Continue with bid even if queueing fails
      }
    }

    /*
    // Optionally send email notifications
    if (process.env.NODE_ENV === 'production') {
      outbidBids.forEach(async (bid) => {
        await sendOutbidNotification(bid.bidderId, auctionId, newBidAmount);
      });
    }
*/

  } catch (error) {
    logger.error('Error updating outbid status:', {
      error: error.message,
      auctionId,
      newBidAmount
    });
    // Don't fail the entire request if outbid update fails
  }
};

// @desc    Delete a bid (with support for soft and permanent delete)
// @route   DELETE /api/bids/:bidId
// @access  Private (Admin for permanent delete)
export const deleteBid = async (req, res) => {
  try {
    const { bidId } = req.params;
    const { permanent = false } = req.query;

    // Find the bid with auction
    const bid = await prisma.bid.findUnique({
      where: { id: bidId },
      include: { auction: true },
    });

    if (!bid) {
      return res.status(404).json({
        success: false,
        message: 'Bid not found',
      });
    }

    // Check user permissions
    const isAdmin = req.user.role === 'admin';
    const actorId = req.user?.id?.toString();
    const isBidder = bid.bidderId.toString() === actorId;

    if (!isAdmin && !isBidder) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this bid',
      });
    }

    // Only admins can permanently delete
    if (permanent && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Only admins can permanently delete bids',
      });
    }

    // Check if auction is active
    if (bid.auction.status === 'active') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete bids on active auctions',
      });
    }

    if (permanent) {
      // Permanent delete
      await prisma.bid.delete({ where: { id: bidId } });
    } else {
      // Soft delete
      await prisma.bid.update({
        where: { id: bidId },
        data: { isDeleted: true, deletedAt: new Date(), deletedById: actorId },
      });
    }

    res.status(200).json({
      success: true,
      message: `Bid ${permanent ? 'permanently' : 'soft'} deleted successfully`,
    });
  } catch (error) {
    logger.error('Delete bid error:', {
      error: error.message,
      bidId: req.params.bidId,
      userId: actorId,
    });

    res.status(500).json({
      success: false,
      message: 'Error deleting bid',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// @desc    Restore a soft-deleted bid
// @route   POST /api/bids/:bidId/restore
// @access  Private (Admin only)
export const restoreBid = async (req, res) => {
  try {
    const { bidId } = req.params;

    // Only admins can restore bids
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can restore deleted bids',
      });
    }

    const bid = await prisma.bid.findUnique({ where: { id: bidId } });

    if (!bid) {
      return res.status(404).json({
        success: false,
        message: 'Bid not found',
      });
    }

    if (!bid.isDeleted) {
      return res.status(400).json({
        success: false,
        message: 'Bid is not deleted',
      });
    }

    await prisma.bid.update({ where: { id: bidId }, data: { isDeleted: false, deletedAt: null, deletedById: null } });

    res.status(200).json({
      success: true,
      message: 'Bid restored successfully',
    });
  } catch (error) {
    logger.error('Restore bid error:', {
      error: error.message,
      bidId: req.params.bidId,
      userId: req.user?.id,
    });

    res.status(500).json({
      success: false,
      message: 'Error restoring bid',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// @desc    Place a bid on an auction
// @route   POST /api/bids
// @access  Private
export const placeBid = async (req, res) => {
  try {
    const { auctionId, amount } = req.body;
    const actorId = req.user?.id?.toString();
    // Acquire a distributed lock per auction to serialize concurrent bids
    const lockKey = `lock:auction:${auctionId}`;
    const lock = await acquireLock(lockKey, 5000, { retries: 20, retryDelay: 25, jitter: 25 });
    if (lock.waitMs) {
      // metrics for lock wait time
      const sumKey = `metrics:auction:${auctionId}:lock_wait_sum`;
      const cntKey = `metrics:auction:${auctionId}:lock_wait_count`;
      try {
        await executeRedisCommand('incrBy', sumKey, Math.max(0, Math.floor(lock.waitMs)));
        await executeRedisCommand('incr', cntKey);
      } catch (e) {
        logger.warn('Failed to record lock wait metrics', { auctionId, error: e.message });
      }
    }
    if (lock.waitMs && lock.waitMs > 200) {
      logger.warn('High lock acquisition latency', { auctionId, waitMs: lock.waitMs });
    }
    try {
      // Run in a transaction
      const result = await prisma.$transaction(async tx => {
        const auction = await tx.auction.findUnique({ where: { id: auctionId } });

        if (!auction) {
          throw new Error('AUCTION_NOT_FOUND');
        }

        // Enforce bid increment
        const minAllowedBid = Number(auction.currentPrice) + Number(auction.bidIncrement);
        if (Number(amount) < minAllowedBid) {
          const err = new Error('BID_TOO_LOW');
          err.details = { minAllowedBid, bidIncrement: Number(auction.bidIncrement) };
          throw err;
        }

        // Check if auction is active
        if (auction.status !== 'active') {
          throw new Error('NOT_ACTIVE');
        }

        // Check if auction has ended
        if (new Date(auction.endDate) < new Date()) {
          await tx.auction.update({ where: { id: auctionId }, data: { status: 'ended' } });
          const err = new Error('ALREADY_ENDED');
          throw err;
        }

        // Check if bid amount is higher than current price
        if (Number(amount) <= Number(auction.currentPrice)) {
          const err = new Error('BID_NOT_HIGHER');
          err.details = { currentPrice: Number(auction.currentPrice) };
          throw err;
        }

        // Check if user is not the seller
        if (auction.sellerId.toString() === actorId) {
          const err = new Error('BID_ON_OWN_AUCTION');
          throw err;
        }

        // Create new bid
        const bid = await tx.bid.create({
          data: {
            amount: new Prisma.Decimal(amount),
            auctionId: auction.id,
            bidderId: actorId,
          },
          include: { bidder: { select: { username: true } } },
        });

        // Update auction current price and (optionally) extend end date if first bid
        const bidCount = await tx.bid.count({ where: { auctionId: auction.id } });
        let newEndDate = auction.endDate;
        if (bidCount === 1) {
          const tenMinutesFromNow = new Date();
          tenMinutesFromNow.setMinutes(tenMinutesFromNow.getMinutes() + 10);
          newEndDate = tenMinutesFromNow;
        }
        await tx.auction.update({
          where: { id: auction.id },
          data: { currentPrice: new Prisma.Decimal(amount), endDate: newEndDate },
        });

        // Update outbid status for lower bids
        await updateOutbidBids(req, auctionId, amount, bid.id);

        return bid;
      });

      // Get io instance from app settings
      const io = req.app.get('io');

      // Emit socket event for real-time updates
      if (io) {
        io.to(`auction_${auctionId}`).emit('newBid', {
          auctionId,
          amount,
          bidder: {
            id: req.user?.id?.toString(),
            username: req.user.username,
          },
          createdAt: result.createdAt,
        });
      }

      res.status(201).json(result);
    } finally {
      // Always release the lock
      await lock.release();
    }
  } catch (error) {
    if (error.message === 'AUCTION_NOT_FOUND') {
      return res.status(404).json({ success: false, message: 'Auction not found' });
    }
    if (error.message === 'LOCK_TIMEOUT') {
      // Metrics: count lock timeouts per auction to identify hot auctions
      const auctionId = req.body?.auctionId;
      const key = `metrics:auction:${auctionId}:lock_timeouts`;
      try {
        const newVal = await executeRedisCommand('incr', key);
        // Keep rolling window (e.g., 1 hour) on first increment
        if (newVal === 1) {
          await executeRedisCommand('expire', key, 3600);
        }
        await executeRedisCommand('incr', 'metrics:bid_lock_timeout_429_total');
      } catch (e) {
        // Non-fatal if metrics fail
        logger.warn('Failed to increment lock timeout metric', { auctionId, error: e.message });
      }
      logger.warn('Bid lock timeout (contention)', { auctionId });
      return res.status(429).json({ success: false, message: 'Too many concurrent bids, please retry' });
    }
    if (error.message === 'BID_TOO_LOW') {
      const { minAllowedBid, bidIncrement } = error.details || {};
      return res.status(400).json({
        success: false,
        message: `Bid must be at least ${bidIncrement} higher than current price (${minAllowedBid})`,
      });
    }
    if (error.message === 'NOT_ACTIVE') {
      return res.status(400).json({ message: 'This auction is not active' });
    }
    if (error.message === 'ALREADY_ENDED') {
      return res.status(400).json({ message: 'This auction has already ended' });
    }
    if (error.message === 'BID_NOT_HIGHER') {
      const { currentPrice } = error.details || {};
      return res.status(400).json({ message: `Bid amount must be higher than $${currentPrice}` });
    }
    if (error.message === 'BID_ON_OWN_AUCTION') {
      return res.status(400).json({ message: 'You cannot bid on your own auction' });
    }
    logger.error('Place bid error:', { error: error.message, stack: error.stack });
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get bids by auction
// @route   GET /api/bids/auction/:auctionId
// @access  Public
export const getBidsByAuction = async (req, res) => {
  try {
    const { auctionId } = req.params;
    const {
      page = 1,
      limit = 10,
      sort = 'amount:desc',
      showDeleted = false,
    } = req.query;

    // Check if auction exists
    const auctionExists = await prisma.auction.findUnique({
      where: { id: auctionId },
      select: { id: true }
    });

    if (!auctionExists) {
      return res.status(404).json({
        status: 'error',
        message: 'Auction not found',
      });
    }

    // Check if user has permission to see deleted bids
    if (showDeleted === 'true' && (!req.user || req.user.role !== 'admin')) {
      return res.status(403).json({
        status: 'error',
        message: 'Not authorized to view deleted bids',
      });
    }

    // Use the repository to get paginated and filtered bids
    const { bids, count, pageNum, take } = await listBidsByAuctionPrisma({
      auctionId,
      showDeleted: showDeleted === 'true',
      page: parseInt(page),
      limit: parseInt(limit),
      sort,
    });

    const totalPages = Math.ceil(count / take);
    const hasNext = pageNum < totalPages;
    const hasPrev = pageNum > 1;

    res.status(200).json({
      status: 'success',
      results: bids.length,
      pagination: {
        currentPage: pageNum,
        total: count,
        totalPages,
        hasNext,
        hasPrev,
      },
      data: {
        bids,
      },
    });
  } catch (error) {
    logger.error('Get bids by auction error:', { error: error.message, stack: error.stack });
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch bids',
    });
  }
};

// @desc    Get my bids
// @route   GET /api/bids/me
// @access  Private
export const getMyBids = async (req, res) => {
  try {
    const {
      status,
      page = 1,
      limit = 10,
      sort = 'createdAt:desc',
      showDeleted = false,
    } = req.query;
    const { id: userId } = req.user;

    // Use the repository to get paginated and filtered bids
    const { bids, count, pageNum, take } = await listBidsPrisma({
      bidderId: userId,
      status,
      showDeleted: showDeleted === 'true',
      page: parseInt(page),
      limit: parseInt(limit),
      sort,
    });

    const totalPages = Math.ceil(count / take);
    const hasNext = pageNum < totalPages;
    const hasPrev = pageNum > 1;

    // Enhance bids with additional information
    const enhancedBids = await Promise.all(bids.map(async (bid) => {
      const auction = await prisma.auction.findUnique({
        where: { id: bid.auctionId },
        select: {
          status: true,
          endDate: true,
          winnerId: true,
        },
      });

      const isWinning = auction?.winnerId === bid.bidderId;
      const isActive = auction?.status === 'active' && new Date(auction?.endDate) > new Date();
      const isEnded = auction ? ['ended', 'sold'].includes(auction.status) : false;

      return {
        ...bid,
        isWinning,
        auctionStatus: auction?.status,
        timeRemaining: isActive && auction?.endDate ? new Date(auction.endDate) - new Date() : null,
        isActive,
        isEnded,
      };
    }));

    res.status(200).json({
      status: 'success',
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalCount: count,
        hasNext,
        hasPrev,
      },
      data: {
        bids: enhancedBids,
      },
    });
  } catch (error) {
    logger.error('Get my bids error:', { error: error.message, stack: error.stack });
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * @desc    Get all bids with optional filtering
 * @route   GET /api/bids
 * @access  Admin
 */
export const getAllBids = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      sort = 'createdAt:desc',
      status,
      auctionId,
      bidderId,
      minAmount,
      maxAmount,
      startDate,
      endDate
    } = req.query;

    // Use the repository to get paginated and filtered bids
    const { bids, count } = await listAllBidsPrisma({
      page: parseInt(page),
      limit: parseInt(limit),
      sort,
      status,
      auctionId,
      bidderId,
      minAmount: minAmount ? parseFloat(minAmount) : undefined,
      maxAmount: maxAmount ? parseFloat(maxAmount) : undefined,
      startDate,
      endDate
    });

    const totalPages = Math.ceil(count / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    res.status(200).json({
      status: 'success',
      results: bids.length,
      pagination: {
        currentPage: parseInt(page),
        total: count,
        totalPages,
        hasNext,
        hasPrev,
      },
      data: {
        bids,
      },
    });
  } catch (error) {
    logger.error('Get all bids error:', { error: error.message, stack: error.stack });
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch bids',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};