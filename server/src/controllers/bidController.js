import { Prisma } from '@prisma/client';
import prisma from '../config/prisma.js';
import logger from '../utils/logger.js';
import { acquireLock } from '../utils/lock.js';
import { executeRedisCommand } from '../config/redis.js';
import { listBidsPrisma, listBidsByAuctionPrisma, listAllBidsPrisma } from '../repositories/bidRepo.prisma.js';
import { addToQueue } from '../services/emailQueue.js';
import { formatCurrency, formatDateTime } from '../utils/format.js';

const updateOutbidBids = async (req, auctionId, newBidAmount, newBidId, currentBidderId) => {
  try {
    // Find all bids that are now outbid by the new bid
    // These are bids with lower amounts that are not already marked as outbid
    // Exclude bids from the current bidder to avoid self-outbid notifications
    const outbidBids = await prisma.bid.findMany({
      where: {
        auctionId,
        amount: { lt: newBidAmount },
        isOutbid: false,
        isDeleted: false,
        bidderId: { not: currentBidderId } // Exclude current bidder's other bids
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

    if (outbidBids.length === 0) {
      logger.info('No bids to mark as outbid', { auctionId, newBidAmount, currentBidderId });
      return;
    }

    // Get the socket instance
    const io = req?.app?.get('io');

    // Update all outbid bids in a transaction with versioning
    await prisma.$transaction(async (tx) => {
      // Get current versions of all outbid bids
      const bidsToUpdate = await tx.bid.findMany({
        where: {
          id: { in: outbidBids.map(bid => bid.id) },
          isOutbid: false // Only update if not already outbid
        },
        select: {
          id: true,
          version: true
        }
      });

      // Update each bid with version check
      for (const bid of bidsToUpdate) {
        await tx.bid.updateMany({
          where: {
            id: bid.id,
            version: bid.version // Optimistic concurrency control
        },
        data: {
          isOutbid: true,
            outbidAt: new Date(),
            version: { increment: 1 }
        }
      });
      }

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
          title: bid.auction.title,
          newBidAmount: formatCurrency(newBidAmount),
          auctionUrl: `${process.env.FRONTEND_URL}/auctions/${auctionId}`,
          endDate: formatDateTime(bid.auction.endDate),
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

    // Log successful outbid processing for debugging
    logger.info('Successfully processed outbid notifications', {
      auctionId,
      newBidId,
      currentBidderId,
      outbidBidsCount: outbidBids.length,
      newBidAmount
    });

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

    // Check if auction is ended or sold
    if (['ended', 'sold'].includes(bid.auction.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete bids on ${bid.auction.status} auctions`,
      });
    }

    // Check if we're in the last 15 minutes of the auction
    const now = new Date();
    const endTime = new Date(bid.auction.endDate);
    const fifteenMinutesInMs = 15 * 60 * 1000; // 15 minutes in milliseconds

    if (now >= new Date(endTime - fifteenMinutesInMs) && bid.auction.status === 'active') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete bids in the last 15 minutes of an auction',
      });
    }

    // Check cancellation limit: Max 2 cancellations per user per auction
    if (!isAdmin) {
      const userCancellations = await prisma.bid.count({
        where: {
          bidderId: req.user.id,
          auctionId: bid.auctionId,
          isDeleted: true,
          deletedById: req.user.id // Ensure it's their own cancellation
        }
      });

      if (userCancellations >= 2) {
        return res.status(400).json({
          success: false,
          message: 'Maximum of 2 bid cancellations allowed per auction',
        });
      }
    }

    // Add retry logic for concurrent operations
    const MAX_RETRIES = 3;
    let retries = 0;
    let result;

    while (retries < MAX_RETRIES) {
      try {
        // Use a transaction with FOR UPDATE to lock the rows
        result = await prisma.$transaction(async (tx) => {
          // 1. Reload the bid with current version
          const currentBid = await tx.bid.findUnique({
            where: { id: bidId },
            select: { version: true, amount: true }
          });

          if (!currentBid) {
            throw new Error('Bid not found');
          }

          // 2. Find the highest active bid (excluding the one being deleted)
          const highestBid = await tx.bid.findFirst({
            where: {
              auctionId: bid.auctionId,
              isDeleted: false,
              id: { not: bidId } // Exclude the current bid we're about to delete
            },
            orderBy: [
              { amount: 'desc' },
              { createdAt: 'asc' } // For tie-breaking
            ],
            take: 1,
            select: {
              id: true,
              amount: true
            }
          });

          // 3. Get current auction state
          const currentAuction = await tx.auction.findUnique({
            where: { id: bid.auctionId },
            select: { version: true, status: true, startingPrice: true }
          });

          // 4. Delete the bid (soft or hard)
          if (permanent) {
            await tx.bid.delete({
              where: {
                id: bidId,
                version: currentBid.version // Ensure version matches
              }
            });
          } else {
            await tx.bid.update({
              where: {
                id: bidId,
                version: currentBid.version // Ensure version matches
              },
              data: {
                isDeleted: true,
                deletedAt: new Date(),
                deletedById: actorId,
                version: { increment: 1 }
              },
            });
          }

          // 5. If this was the highest bid, update the auction
          if (currentBid.amount === bid.auction.currentPrice) {
            const newPrice = highestBid ? highestBid.amount : currentAuction.startingPrice;
            const newHighestBidId = highestBid ? highestBid.id : null;

            await tx.auction.update({
              where: {
                id: bid.auctionId,
                version: currentAuction.version // Ensure no concurrent updates
              },
              data: {
                currentPrice: newPrice,
                version: { increment: 1 }
              }
            });

            return { newPrice, newHighestBidId };
          }

          return { newPrice: null, newHighestBidId: null };
        }, {
          maxWait: 5000, // Max time to wait for the transaction (5s)
          timeout: 10000, // Max time to process the transaction (10s)
          isolationLevel: 'Serializable' // Strongest isolation level
        });

        // If we get here, the transaction succeeded
        break;
      } catch (error) {
        // If it's a version conflict, retry
        if (error.code === 'P2025' || error.message.includes('version')) {
          retries++;
          if (retries === MAX_RETRIES) {
            throw new Error('Failed to process bid cancellation due to concurrent modifications. Please try again.');
          }
          // Add exponential backoff
          await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, retries)));
          continue;
        }
        throw error; // Re-throw other errors
      }
    }

    // Cache invalidation for the highest bid
    if (result?.newPrice !== null) {
      // Invalidate any caches related to this auction's highest bid
      try {
        await cache.del(`auction:${bid.auctionId}:highestBid`);
        await cache.del(`auction:${bid.auctionId}:currentPrice`);
      } catch (cacheError) {
        logger.error('Cache invalidation failed:', { error: cacheError.message });
        // Continue even if cache invalidation fails
      }
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
  const MAX_RETRIES = 3;
  let retries = 0;
  let result;
  const { auctionId, amount } = req.body;
  const actorId = req.user?.id?.toString();

  // Input validation
  if (!auctionId || !amount) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  // Acquire a distributed lock per auction to serialize concurrent bids
  const lockKey = `lock:auction:${auctionId}`;
  let lock;
  try {
    lock = await acquireLock(lockKey, 5000, { retries: 20, retryDelay: 25, jitter: 25 });
  } catch (error) {
    if (error.message === 'AUCTION_LOCK_TIMEOUT') {
      // Metrics: count lock timeouts per auction to identify hot auctions
      const key = `metrics:auction:${auctionId}:lock_timeouts`;
      try {
        const waitTime = error.details?.waitTimeMs || 0;
        await executeRedisCommand('incrBy', key, Math.floor(waitTime));
        const newVal = await executeRedisCommand('get', key);
        if (newVal === '1') {
          await executeRedisCommand('expire', key, 3600);
        }
        await executeRedisCommand('incr', 'metrics:bid_lock_timeout_429_total');
      } catch (e) {
        logger.warn('Failed to increment lock timeout metric', { auctionId, error: e.message });
      }
      logger.warn('Bid lock acquisition failed (contention)', {
        auctionId,
        waitMs: error.details?.waitTimeMs,
        retries: error.details?.retries
      });
      const userMessage = error.details?.message || 'This auction is experiencing high bid activity. Please wait a moment and try again.';
      return res.status(429).json({
        success: false,
        message: userMessage,
        retryAfter: Math.ceil(error.details?.ttlMs / 1000) || 5
      });
    }
    throw error; // Re-throw if it's a different error
  }
  
  try {
    // Log lock acquisition metrics
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

    while (retries < MAX_RETRIES) {
      try {
        // Run in a transaction with retry logic
        result = await prisma.$transaction(async (tx) => {
          // 1. Get current auction state with version
          const auction = await tx.auction.findUnique({
            where: { id: auctionId },
            select: {
              id: true,
              status: true,
              currentPrice: true,
              bidIncrement: true,
              endDate: true,
              sellerId: true,
              version: true
            }
          });

          if (!auction) {
            throw new Error('AUCTION_NOT_FOUND');
          }

          // 2. Validate bid
          const minAllowedBid = Number(auction.currentPrice) + Number(auction.bidIncrement);
          if (Number(amount) < minAllowedBid) {
            const err = new Error('BID_TOO_LOW');
            err.details = { minAllowedBid, bidIncrement: Number(auction.bidIncrement) };
            throw err;
          }

          if (auction.status !== 'active') {
            throw new Error('NOT_ACTIVE');
          }

          const now = new Date();
          if (new Date(auction.endDate) < now) {
            await tx.auction.update({ 
              where: { id: auctionId, version: auction.version },
              data: { status: 'ended', version: { increment: 1 } } 
            });
            throw new Error('ALREADY_ENDED');
          }

          if (auction.sellerId.toString() === actorId) {
            throw new Error('BID_ON_OWN_AUCTION');
          }

          // 3. Create new bid with version
          const bid = await tx.bid.create({
            data: {
              amount: new Prisma.Decimal(amount),
              auctionId: auction.id,
              bidderId: actorId,
              version: 1
            },
            select: {
              id: true,
              amount: true,
              createdAt: true,
              bidder: { select: { id: true, username: true } }
            }
          });

          // 4. Check if this is the first bid
          const bidCount = await tx.bid.count({ 
            where: { 
              auctionId: auction.id,
              isDeleted: false
            } 
          });

          // 5. Update auction with version check
          const updateData = {
            currentPrice: new Prisma.Decimal(amount),
            version: { increment: 1 }
          };

          // Extend auction end time if it's the first bid AND auction is ending soon (sniping protection)
          if (bidCount === 1) {
            const currentEndDate = new Date(auction.endDate);
            const now = new Date();
            const tenMinutesFromNow = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes from now
            const timeUntilEnd = currentEndDate.getTime() - now.getTime();
            const tenMinutesInMs = 10 * 60 * 1000;

            // Only extend if the auction is ending within the next 10 minutes
            if (timeUntilEnd <= tenMinutesInMs) {
              updateData.endDate = tenMinutesFromNow;
              logger.info('Extended auction end time due to first bid', {
                auctionId: auction.id,
                originalEndDate: auction.endDate,
                newEndDate: tenMinutesFromNow,
                timeUntilOriginalEnd: Math.round(timeUntilEnd / 1000 / 60) + ' minutes'
              });
            } else {
              logger.info('First bid placed but auction has plenty of time left, no extension needed', {
                auctionId: auction.id,
                timeUntilEnd: Math.round(timeUntilEnd / 1000 / 60 / 60) + ' hours'
              });
            }
          }

          await tx.auction.update({
            where: { 
              id: auction.id,
              version: auction.version // Ensure no concurrent updates
            },
            data: updateData,
          });

          // 6. Update outbid status for lower bids
          await updateOutbidBids(req, auctionId, amount, bid.id, actorId);

          return bid;
        }, {
          maxWait: 5000,
          timeout: 10000,
          isolationLevel: 'Serializable'
        });

        // If we get here, the transaction succeeded
        break;
      } catch (error) {
        // Log the error for debugging
        logger.warn('Bid placement retry attempt', {
          attempt: retries + 1,
          errorCode: error.code,
          errorMessage: error.message,
          auctionId: auctionId
        });

        // If it's a version conflict, retry
        if (error.code === 'P2025' || error.message.includes('version') ||
            error.message.includes('concurrent') || error.message.includes('optimistic')) {
          retries++;
          if (retries === MAX_RETRIES) {
            logger.error('Bid placement failed after max retries', {
              totalRetries: retries,
              auctionId: auctionId,
              errorCode: error.code,
              errorMessage: error.message
            });
            throw new Error('Failed to place bid due to concurrent modifications. Please try again.');
          }
          // Add exponential backoff
          await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, retries)));
          continue;
        }
        throw error; // Re-throw other errors
      }
    }

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
    /*
    } finally {
      // Always release the lock
      await lock.release();
    }
    */
  } catch (error) {
    if (error.message === 'AUCTION_NOT_FOUND') {
      return res.status(404).json({ success: false, message: 'Auction not found' });
    }
    if (error.message === 'AUCTION_LOCK_TIMEOUT') {
      // Metrics: count lock timeouts per auction to identify hot auctions
      const auctionId = req.body?.auctionId;
      const key = `metrics:auction:${auctionId}:lock_timeouts`;
      try {
        const waitTime = error.details?.waitTimeMs || 0;
        await executeRedisCommand('incrBy', key, Math.floor(waitTime));
        // Keep rolling window (e.g., 1 hour) on first increment
        const newVal = await executeRedisCommand('get', key);
        if (newVal === '1') {
          await executeRedisCommand('expire', key, 3600);
        }
        await executeRedisCommand('incr', 'metrics:bid_lock_timeout_429_total');
      } catch (e) {
        // Non-fatal if metrics fail
        logger.warn('Failed to increment lock timeout metric', { auctionId, error: e.message });
      }
      logger.warn('Bid lock timeout (contention)', {
        auctionId,
        waitMs: error.details?.waitTimeMs,
        retries: error.details?.retries
      });
      const userMessage = error.details?.message || 'Too many concurrent bids on this auction. Please wait a moment and try again.';
      return res.status(429).json({
        success: false,
        message: userMessage,
        retryAfter: Math.ceil(error.details?.ttlMs / 1000) || 5
      });
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
      status,
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
    if ((status === 'cancelled' || status === 'all') && (!req.user || req.user.role !== 'admin')) {
      return res.status(403).json({
        status: 'error',
        message: 'Not authorized to view deleted bids',
      });
    }

    // Use the repository to get paginated and filtered bids
    const { bids, count, pageNum, take } = await listBidsByAuctionPrisma({
      auctionId,
      status,
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
    } = req.query;
    const { id: userId } = req.user;

    // Check if user has permission to view cancelled bids
    if ((status === 'cancelled' || status === 'all') && req.user.role !== 'admin') {
      return res.status(403).json({
        status: 'error',
        message: 'Not authorized to view cancelled bids',
      });
    }

    // Use the repository to get paginated and filtered bids
    const { bids, count, pageNum, take } = await listBidsPrisma({
      bidderId: userId,
      status,
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