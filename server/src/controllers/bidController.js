import { Prisma } from '@prisma/client';
import prisma from '../config/prisma.js';
import logger from '../utils/logger.js';
import { acquireLock } from '../utils/lock.js';
import {
  listBidsPrisma,
  listBidsByAuctionPrisma,
  listAllBidsPrisma,
} from '../repositories/bidRepo.prisma.js';
import { addToQueue } from '../services/emailQueue.js';
import { formatCurrency, formatDateTime } from '../utils/format.js';
import { env, validateEnv } from '../config/env.js';

// Validate required environment variables
const missingVars = validateEnv();
if (missingVars.length > 0) {
  logger.error(`Missing required environment variables: ${missingVars.join(', ')}`);
  process.exit(1);
}

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
        bidderId: { not: currentBidderId }, // Exclude current bidder's other bids
      },
      include: {
        bidder: {
          select: {
            id: true,
            email: true,
            firstname: true,
          },
        },
        auction: {
          select: {
            id: true,
            title: true,
            endDate: true,
          },
        },
      },
    });

    // Verify the new bid is still the highest before processing outbid notifications
    const currentHighestBid = await prisma.bid.findFirst({
      where: {
        auctionId,
        isDeleted: false,
        isOutbid: false,
      },
      orderBy: { amount: 'desc' },
      take: 1,
      select: { id: true, amount: true },
    });

    // If our bid is no longer the highest, another bid was placed concurrently
    if (!currentHighestBid || currentHighestBid.id !== newBidId) {
      logger.warn('New bid is no longer the highest, skipping outbid notifications', {
        auctionId,
        newBidId,
        newBidAmount,
        currentHighestBidId: currentHighestBid?.id,
        currentHighestAmount: currentHighestBid?.amount,
      });
      return;
    }

    // Update all outbid bids in a transaction with versioning
    await prisma.$transaction(async tx => {
      // Get current versions of all outbid bids (don't recheck isOutbid to avoid race conditions)
      const bidsToUpdate = await tx.bid.findMany({
        where: {
          id: { in: outbidBids.map(bid => bid.id) },
        },
        select: {
          id: true,
          version: true,
          isOutbid: true, // Check current state
        },
      });

      // Only update bids that are still not outbid (avoid double-marking)
      const bidsStillNotOutbid = bidsToUpdate.filter(bid => !bid.isOutbid);

      if (bidsStillNotOutbid.length === 0) {
        logger.info('All outbid bids were already marked as outbid by concurrent process', {
          auctionId,
          newBidAmount,
          totalFound: outbidBids.length,
          alreadyOutbid: bidsToUpdate.length - bidsStillNotOutbid.length,
        });
        return; // Exit transaction early
      }

      // Update each bid with version check
      for (const bid of bidsStillNotOutbid) {
        try {
          await tx.bid.update({
            where: {
              id: bid.id,
              version: bid.version, // Optimistic concurrency control
            },
            data: {
              isOutbid: true,
              outbidAt: new Date(),
              version: { increment: 1 },
            },
          });
        } catch (updateError) {
          // If version conflict, bid was already updated by another process
          if (updateError.code === 'P2025') {
            logger.info('Bid already updated by concurrent process, skipping', {
              bidId: bid.id,
              auctionId,
            });
            continue;
          }
          throw updateError;
        }
      }

      // Get the socket instance
      const io = req?.app?.get('io');

      // Emit real-time notifications to outbid users
      if (io) {
        outbidBids.forEach(bid => {
          io.to(`user_${bid.bidder.id}`).emit('bid:outbid', {
            auctionId,
            bidId: bid.id,
            newBidAmount,
            outbidAt: new Date(),
          });
        });
      }
    });

    // Add outbid email to queue (outside transaction to avoid rollback issues)
    for (const bid of outbidBids) {
      try {
        // Double-check that this bid hasn't already been marked as outbid
        // to prevent duplicate notifications
        const currentBid = await prisma.bid.findUnique({
          where: { id: bid.id },
          select: { isOutbid: true, outbidAt: true },
        });

        if (currentBid?.isOutbid) {
          logger.info('Bid already marked as outbid, skipping notification', {
            bidId: bid.id,
            userEmail: bid.bidder.email,
            outbidAt: currentBid.outbidAt,
          });
          continue;
        }

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
        // Continue with other notifications even if one fails
      }
    }

    // Log successful outbid processing for debugging
    logger.info('Successfully processed outbid notifications', {
      auctionId,
      newBidId,
      currentBidderId,
      outbidBidsCount: outbidBids.length,
      newBidAmount,
    });
  } catch (error) {
    logger.error('Error updating outbid status:', {
      error: error.message,
      auctionId,
      newBidAmount,
    });
    // Don't fail the entire request if outbid update fails
  }
};

/**
 * Core bid placement logic for REST and Socket.IO
 * Accepts: { auctionId, amount, actorId, io, socket }
 * Returns: bid result or throws error
 */
export const placeBidCore = async ({ auctionId, amount, actorId, io, socket }) => {
  const MAX_RETRIES = 3;
  let retries = 0;
  let result;
  // Input validation
  if (!auctionId || !amount) {
    throw new Error('Missing required fields');
  }
  // Acquire a distributed lock per auction to serialize concurrent bids
  const lockKey = `lock:auction:${auctionId}`;
  let lock;
  try {
    lock = await acquireLock(lockKey, 5000, { retries: 20, retryDelay: 25, jitter: 25 });
  } catch (error) {
    if (error.message === 'AUCTION_LOCK_TIMEOUT') {
      throw new Error('Bid lock acquisition failed (contention)');
    }
    throw error;
  }
  try {
    while (retries < MAX_RETRIES) {
      try {
        result = await prisma.$transaction(
          async tx => {
            const auction = await tx.auction.findUnique({
              where: { id: auctionId },
              select: {
                id: true,
                status: true,
                currentPrice: true,
                bidIncrement: true,
                endDate: true,
                sellerId: true,
                version: true,
              },
            });

            if (!auction) throw new Error('AUCTION_NOT_FOUND');
            const minAllowedBid = Number(auction.currentPrice) + Number(auction.bidIncrement);
            if (Number(amount) < minAllowedBid) {
              const err = new Error('BID_TOO_LOW');
              err.details = { minAllowedBid, bidIncrement: Number(auction.bidIncrement) };
              throw err;
            }

            if (auction.status !== 'active') throw new Error('NOT_ACTIVE');

            const now = new Date();
            if (new Date(auction.endDate) < now) {
              await tx.auction.update({
                where: { id: auctionId, version: auction.version },
                data: { status: 'ended', version: { increment: 1 } },
              });
              throw new Error('ALREADY_ENDED');
            }

            if (auction.sellerId.toString() === actorId) throw new Error('BID_ON_OWN_AUCTION');

            const bid = await tx.bid.create({
              data: {
                amount: new Prisma.Decimal(amount),
                auctionId: auction.id,
                bidderId: actorId,
                version: 1,
              },
              select: {
                id: true,
                amount: true,
                createdAt: true,
                bidder: { select: { id: true, username: true } },
              },
            });

            const bidCount = await tx.bid.count({
              where: { auctionId: auction.id, isDeleted: false },
            });

            const updateData = {
              currentPrice: new Prisma.Decimal(amount),
              highestBidId: bid.id,
              version: { increment: 1 },
            };

            // Extend auction end time if it's the first bid AND auction is ending soon (sniping protection)
            if (bidCount === 1) {
              const currentEndDate = new Date(auction.endDate);
              const now = new Date();
              const timeUntilEnd = currentEndDate.getTime() - now.getTime();
              const auctionExtensionMs = env.auctionExtensionMinutes;

              // Only extend if the auction is ending within the extension window
              if (timeUntilEnd <= auctionExtensionMs) {
                const newEndDate = new Date(currentEndDate.getTime() + auctionExtensionMs);
                updateData.endDate = newEndDate;

                logger.info('Extended auction end time due to first bid', {
                  auctionId: auction.id,
                  originalEndDate: auction.endDate,
                  newEndDate,
                  timeUntilOriginalEnd: Math.round(timeUntilEnd / 1000 / 60) + ' minutes',
                });
              }
            }
            await tx.auction.update({
              where: { id: auction.id, version: auction.version },
              data: updateData,
            });
            return { ...bid, auctionId, amount };
          },
          { maxWait: 5000, timeout: 10000, isolationLevel: 'Serializable' }
        );
        break;
      } catch (error) {
        if (
          error.code === 'P2025' ||
          error.message.includes('version') ||
          error.message.includes('concurrent') ||
          error.message.includes('optimistic')
        ) {
          retries++;
          if (retries === MAX_RETRIES)
            throw new Error(
              'Failed to place bid due to concurrent modifications. Please try again.'
            );
          await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, retries)));
          continue;
        }
        throw error;
      }
    }
    if (result) {
      // For socket, pass a minimal req object for updateOutbidBids
      await updateOutbidBids(
        { app: { get: k => io } },
        result.auctionId,
        result.amount,
        result.id,
        actorId
      );
      // Emit socket event for real-time updates
      if (io) {
        io.to(`auction_${auctionId}`).emit('newBid', {
          auctionId,
          amount,
          bidder: { id: actorId },
          createdAt: result.createdAt,
        });
      }
    }
    return result;
  } finally {
    if (lock)
      await lock
        .release()
        .catch(err => logger.error('Lock release failed', { auctionId, error: err.message }));
  }
};

// @desc    Delete a bid (with support for soft and permanent delete)
// @route   DELETE /api/bids/:bidId
// @access  Private (Admin for permanent delete)
export const deleteBid = async (req, res) => {
  const { bidId } = req.params;
  const actorId = req.user?.id?.toString();

  const getPermanentValue = value => {
    if (value == null) return false;
    if (typeof value === 'string') return value.toLowerCase() === 'true';
    return !!value;
  };
  // Accept permanent from query string (?permanent=true) and fallback to body for backward compatibility
  const permanent =
    getPermanentValue(req.query?.permanent) || getPermanentValue(req.body?.permanent);

  try {
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
          deletedById: req.user.id, // Ensure it's their own cancellation
        },
      });

      if (userCancellations >= 2) {
        return res.status(400).json({
          success: false,
          message: 'Maximum of 2 bid cancellations allowed per auction',
        });
      }
    }

    // Add retry logic for concurrent operations
    const MAX_RETRIES = 5; // Increased from 3 to 5 for better resilience
    let retries = 0;
    let result;

    while (retries < MAX_RETRIES) {
      try {
        // Use a transaction with FOR UPDATE to lock the rows
        result = await prisma.$transaction(
          async tx => {
            // 1. Reload the bid with current version
            const currentBid = await tx.bid.findUnique({
              where: { id: bidId },
              select: { version: true, amount: true },
            });

            if (!currentBid) {
              throw new Error('Bid not found');
            }

            // 2. Find the highest active bid (excluding the one being deleted)
            const highestBid = await tx.bid.findFirst({
              where: {
                auctionId: bid.auctionId,
                isDeleted: false,
                id: { not: bidId }, // Exclude the current bid we're about to delete
              },
              orderBy: [
                { amount: 'desc' },
                { createdAt: 'asc' }, // For tie-breaking
              ],
              take: 1,
              select: {
                id: true,
                amount: true,
              },
            });

            // 3. Get current auction state
            const currentAuction = await tx.auction.findUnique({
              where: { id: bid.auctionId },
              select: { version: true, status: true, startingPrice: true },
            });

            // 4. Delete the bid (soft or hard)
            if (permanent) {
              await tx.bid.delete({
                where: {
                  id: bidId,
                  version: currentBid.version, // Ensure version matches
                },
              });
            } else {
              await tx.bid.update({
                where: {
                  id: bidId,
                  version: currentBid.version, // Ensure version matches
                },
                data: {
                  isDeleted: true,
                  deletedAt: new Date(),
                  deletedById: actorId,
                  version: { increment: 1 },
                },
              });
            }

            // 5. Update auction price if the deleted bid was the highest
            // Find the new highest bid after deletion
            const newHighestBid = await tx.bid.findFirst({
              where: {
                auctionId: bid.auctionId,
                isDeleted: false,
                isOutbid: false,
              },
              orderBy: [
                { amount: 'desc' },
                { createdAt: 'asc' }, // For tie-breaking
              ],
              take: 1,
              select: {
                id: true,
                amount: true,
              },
            });

            // Calculate the new current price
            const newCurrentPrice = newHighestBid
              ? newHighestBid.amount
              : currentAuction.startingPrice;
            const newHighestBidId = newHighestBid ? newHighestBid.id : null;

            // Log the price update for debugging
            logger.info('Updating auction price after bid deletion', {
              auctionId: bid.auctionId,
              deletedBidAmount: currentBid.amount,
              oldCurrentPrice: currentAuction.currentPrice,
              newCurrentPrice: newCurrentPrice,
              newHighestBidId: newHighestBidId,
              hasNewHighestBid: !!newHighestBid,
            });

            // Update auction with new price and highest bid
            await tx.auction.update({
              where: {
                id: bid.auctionId,
                version: currentAuction.version, // Ensure no concurrent updates
              },
              data: {
                currentPrice: newCurrentPrice,
                highestBidId: newHighestBidId,
                version: { increment: 1 },
              },
            });

            return { newPrice: newCurrentPrice, newHighestBidId };
          },
          {
            maxWait: 5000, // Max time to wait for the transaction (5s)
            timeout: 10000, // Max time to process the transaction (10s)
            isolationLevel: 'Serializable', // Strongest isolation level
          }
        );

        // If we get here, the transaction succeeded
        break;
      } catch (error) {
        // Log retry attempts for debugging
        logger.warn('Bid deletion retry attempt', {
          attempt: retries + 1,
          maxRetries: MAX_RETRIES,
          errorCode: error.code,
          errorMessage: error.message,
          auctionId: bid.auctionId,
        });

        // If it's a version conflict, retry
        if (error.code === 'P2025' || error.message.includes('version')) {
          retries++;
          if (retries === MAX_RETRIES) {
            logger.error('Bid deletion failed after max retries', {
              totalRetries: retries,
              auctionId: bid.auctionId,
              errorCode: error.code,
              errorMessage: error.message,
            });
            throw new Error(
              'Failed to process bid cancellation due to concurrent modifications. Please try again.'
            );
          }
          // Add exponential backoff with jitter to reduce thundering herd
          const baseDelay = 100 * Math.pow(2, retries);
          const jitter = Math.random() * 50; // Add random jitter up to 50ms
          await new Promise(resolve => setTimeout(resolve, baseDelay + jitter));
          continue;
        }
        throw error; // Re-throw other errors
      }
    }

    // Note: Cache invalidation would happen here if cache was configured
    // For now, the database will be the source of truth
    if (result?.newPrice !== null) {
      logger.info('Bid deletion completed - cache would be invalidated here', {
        auctionId: bid.auctionId,
        oldPrice: bid.auction.currentPrice,
        newPrice: result.newPrice,
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
      userId: actorId, // Now actorId is accessible here
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

    await prisma.bid.update({
      where: { id: bidId },
      data: { isDeleted: false, deletedAt: null, deletedById: null },
    });

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
    const io = req?.app?.get('io');
    const result = await placeBidCore({ auctionId, amount, actorId, io });
    res.status(201).json(result);
  } catch (error) {
    if (error.message === 'AUCTION_NOT_FOUND') {
      return res.status(404).json({ success: false, message: 'Auction not found' });
    }
    if (error.message === 'Bid lock acquisition failed (contention)') {
      return res.status(429).json({ success: false, message: 'Too many concurrent bids. Please try again.' });
    }
    if (error.message === 'BID_TOO_LOW') {
      const { minAllowedBid, bidIncrement } = error.details || {};
      return res.status(400).json({ success: false, message: `Bid must be at least ${bidIncrement} higher than current price (${minAllowedBid})` });
    }
    if (error.message === 'NOT_ACTIVE') {
      return res.status(400).json({ message: 'This auction is not active' });
    }
    if (error.message === 'ALREADY_ENDED') {
      return res.status(400).json({ message: 'This auction has already ended' });
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
    const { page = 1, limit = 10, sort = 'amount:desc', status } = req.query;

    // Check if auction exists
    const auctionExists = await prisma.auction.findUnique({
      where: { id: auctionId },
      select: { id: true },
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
      highestBidderOnly = 'false',
      winningBidsOnly = 'false'
    } = req.query;
    
    const { id: userId } = req.user;

    // Check if user has permission to view cancelled bids
    if ((status === 'cancelled' || status === 'all') && req.user.role !== 'admin') {
      return res.status(403).json({
        status: 'error',
        message: 'Not authorized to view cancelled bids',
      });
    }

    // First, get all the user's bids
    let { bids, count, pageNum, take } = await listBidsPrisma({
      bidderId: userId,
      status,
      page: parseInt(page),
      limit: parseInt(limit),
      sort,
    });

    // Apply filters if needed
    if (highestBidderOnly === 'true' || winningBidsOnly === 'true') {
      // Get all auctions where the user has bids
      const auctionIds = [...new Set(bids.map(bid => bid.auctionId))];
      
      // Build the where clause based on filter type
      const where = {
        id: { in: auctionIds },
        isDeleted: false
      };

      if (highestBidderOnly === 'true') {
        // For highest bidder, check current highest bid
        where.highestBid = { bidderId: userId };
      } else if (winningBidsOnly === 'true') {
        // For winning bids, check if auction ended and user is the winner
        where.AND = [
          { status: { in: ['ended', 'sold'] } },
          { winnerId: userId }
        ];
      }
      
      // Find matching auctions
      const matchingAuctions = await prisma.auction.findMany({
        where,
        select: {
          id: true,
          highestBidId: true,
          status: true,
          winnerId: true
        }
      });

      const matchingAuctionIds = new Set(
        matchingAuctions.map(a => a.id)
      );

      // Filter bids based on the selected filter
      if (highestBidderOnly === 'true') {
        bids = bids.filter(bid => matchingAuctionIds.has(bid.auctionId));
      } else if (winningBidsOnly === 'true') {
        // For winning bids, only include bids that won the auction
        const winningBidIds = new Set(
          matchingAuctions.map(a => a.highestBidId).filter(Boolean)
        );
        bids = bids.filter(bid => winningBidIds.has(bid.id));
      }
      
      // Update count and pagination
      count = bids.length;
      const totalPages = Math.ceil(count / take);
      pageNum = Math.min(pageNum, Math.max(1, totalPages));
    }

    const totalPages = Math.ceil(count / take);
    const hasNext = pageNum < totalPages;
    const hasPrev = pageNum > 1;

    // Enhance bids with additional information
    const enhancedBids = await Promise.all(
      bids.map(async bid => {
        // Get auction and highest bid in parallel for better performance
        const [auction, highestBid] = await Promise.all([
          prisma.auction.findUnique({
            where: { id: bid.auctionId },
            select: {
              status: true,
              endDate: true,
              winnerId: true,
              highestBidId: true,
            },
          }),
          // Get the highest bid for this auction
          prisma.bid.findFirst({
            where: { 
              auctionId: bid.auctionId, 
              isDeleted: false 
            },
            orderBy: { amount: 'desc' },
            select: { 
              id: true,
              bidderId: true,
              amount: true
            },
          }),
        ]);

        const isActive = auction?.status === 'active' && new Date(auction?.endDate) > new Date();
        const isEnded = auction ? ['ended', 'sold'].includes(auction.status) : false;
        
        // User is winning if:
        // 1. Auction is active AND they have the highest bid, OR
        // 2. Auction has ended AND they are the winner
        const isWinning = isActive 
          ? highestBid?.bidderId === bid.bidderId
          : auction?.winnerId === bid.bidderId;

        return {
          ...bid,
          isWinning,
          auctionStatus: auction?.status,
          timeRemaining:
            isActive && auction?.endDate ? new Date(auction.endDate) - new Date() : null,
          isActive,
          isEnded,
        };
      })
    );

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
      endDate,
    } = req.query;

    // Use the repository to get paginated and filtered bids
    const { bids, count, pageNum, take } = await listAllBidsPrisma({
      page: parseInt(page),
      limit: parseInt(limit),
      sort,
      status,
      auctionId,
      bidderId,
      minAmount: minAmount ? parseFloat(minAmount) : undefined,
      maxAmount: maxAmount ? parseFloat(maxAmount) : undefined,
      startDate,
      endDate,
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
    logger.error('Error fetching all bids:', {
      error: error.message,
      stack: error.stack,
      query: req.query,
    });
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch bids',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};
