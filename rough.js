import { Prisma } from '@prisma/client';
import prisma from '../config/prisma.js';
import logger from '../utils/logger.js';
import { acquireLock } from '../utils/lock.js';
import * as bidRepo from '../repositories/bidRepo.prisma.js';
import { addToQueue } from '../services/emailQueue.js';
import { formatCurrency, formatDateTime } from '../utils/format.js';
import { env, validateEnv } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';

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
    const outbidBids = await bidRepo.findOutbidCandidates(auctionId, newBidAmount, currentBidderId);

    // Verify the new bid is still the highest before processing outbid notifications
    const currentHighestBid = await bidRepo.findCurrentHighestBid(auctionId);

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
      const bidsToUpdate = await bidRepo.findBidsByIds(tx, outbidBids.map(bid => bid.id));

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
          await bidRepo.updateBidWithVersion(tx, bid.id, bid.version, {
            isOutbid: true,
            outbidAt: new Date(),
            version: { increment: 1 },
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
        const currentBid = await bidRepo.findBidById(bid.id, { select: { isOutbid: true, outbidAt: true } });

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
    throw new AppError('MISSING_FIELDS', 'Missing required fields', 400);
  }
  // Acquire a distributed lock per auction to serialize concurrent bids
  const lockKey = `lock:auction:${auctionId}`;
  let lock;
  try {
    lock = await acquireLock(lockKey, 5000, { retries: 20, retryDelay: 25, jitter: 25 });
  } catch (error) {
    // Lock errors are already AppError instances, just rethrow
    throw error;
  }
  try {
    while (retries < MAX_RETRIES) {
      try {
        result = await prisma.$transaction(
          async tx => {
            const auction = await bidRepo.getAuctionById(tx, auctionId, {
              id: true,
              status: true,
              currentPrice: true,
              bidIncrement: true,
              endDate: true,
              sellerId: true,
              version: true,
            });

            if (!auction) {
              throw new AppError('AUCTION_NOT_FOUND', 'Auction not found', 404);
            }

            if (auction.status !== 'active') {
              throw new AppError('AUCTION_NOT_ACTIVE', 'Auction is not active', 400);
            }

            if (auction.sellerId.toString() === actorId) {
              throw new AppError('BID_ON_OWN_AUCTION', 'You cannot bid on your own auction', 400);
            }

            // Check if the user already has an active bid for this amount
            const existingActiveBid = await tx.bid.findFirst({
              where: {
                auctionId: auction.id,
                bidderId: actorId,
                amount: new Prisma.Decimal(amount),
                isDeleted: false,
                isOutbid: false,
              },
            });

            if (existingActiveBid) {
              throw new AppError('BID_ALREADY_EXISTS', 'You are currently the highest bidder at this amount. To confirm your bid, please increase your amount.', 400);
            }

            const minAllowedBid = Number(auction.currentPrice) + Number(auction.bidIncrement);
            if (Number(amount) < minAllowedBid) {
              throw new AppError('BID_TOO_LOW', `Bid must be at least ${auction.bidIncrement} higher than current price (${auction.currentPrice})`, 400, { currentPrice: auction.currentPrice, bidIncrement: auction.bidIncrement, minAllowedBid });
            }

            const now = new Date();
            if (new Date(auction.endDate) < now) {
              await tx.auction.update({
                where: { id: auctionId, version: auction.version },
                data: { status: 'ended', version: { increment: 1 } },
              });
              throw new AppError('AUCTION_ENDED', 'Auction has already ended', 400);
            }

            const bid = await bidRepo.createBidTx(tx, { amount: new Prisma.Decimal(amount), auctionId: auction.id, bidderId: actorId });

            const bidCount = await bidRepo.countBidsTx(tx, auction.id);

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
            await bidRepo.updateAuctionTx(tx, auction.id, auction.version, updateData);
            return { ...bid, auctionId, amount };
          },
          { maxWait: 5000, timeout: 10000, isolationLevel: 'Serializable' }
        );
        break;
      } catch (error) {
        if (
          error.code === 'P2025'
        ) {
          retries++;
          if (retries === MAX_RETRIES)
            throw new AppError('CONCURRENT_MODIFICATION', 'Failed to place bid due to concurrent modifications. Please try again.', 409);
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

// @desc    Place a bid on an auction
// @route   POST /api/bids
// @access  Private
export const placeBid = async (req, res, next) => {
  try {
    const { auctionId, amount } = req.body;
    const actorId = req.user?.id?.toString();
    const io = req?.app?.get('io');
    const result = await placeBidCore({ auctionId, amount, actorId, io });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a bid (with support for soft and permanent delete)
// @route   DELETE /api/bids/:bidId
// @access  Private (Admin for permanent delete)
export const deleteBid = async (req, res, next) => {
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
    const bid = await bidRepo.getBidWithAuction(bidId);

    if (!bid) {
      throw new AppError('BID_NOT_FOUND', 'Bid not found', 404);
    }

    // Check user permissions
    const isAdmin = req.user.role === 'admin';
    const isBidder = bid.bidderId.toString() === actorId;

    if (!isAdmin && !isBidder) {
      throw new AppError('UNAUTHORIZED', 'Not authorized to delete this bid', 403);
    }

    // Only admins can permanently delete
    if (permanent && !isAdmin) {
      throw new AppError('UNAUTHORIZED', 'Only admins can permanently delete bids', 403);
    }

    // Check if auction is sold or completed or cancelled
    if (['sold', 'completed', 'cancelled'].includes(bid.auction.status)) {
      throw new AppError('UNAUTHORIZED', `Cannot delete bids on ${bid.auction.status} auctions`, 400);
    }

    // Check if we're in the last 1 hour of the auction
    const now = new Date();
    const endTime = new Date(bid.auction.endDate);
    const OneHourInMs = 60 * 60 * 1000; // 1 hour in milliseconds

    if (now >= new Date(endTime - OneHourInMs) && bid.auction.status === 'active') {
      throw new AppError('CANCELLATION_WINDOW_CLOSED', 'Bids cannot be canceled within the final hour of the auction.', 400);
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

      if (userCancellations >= 1) {
        throw new AppError('UNAUTHORIZED', 'Maximum of 1 bid cancellation allowed per auction', 400);
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
            // Reload the bid with current version
            const bidsArr = await bidRepo.findBidsByIds(tx, [bidId]);
            const currentBid = bidsArr[0];

            if (!currentBid) {
              throw new AppError('BID_NOT_FOUND', 'Bid not found', 404);
            }

            if (currentBid.isDeleted && !permanent) {
              throw new AppError('BID_ALREADY_CANCELLED', 'This bid has already been cancelled', 400);
            }

            // Get current auction state
            const currentAuction = await bidRepo.getAuctionById(tx, bid.auctionId, { version: true, status: true, startingPrice: true, currentPrice: true });

            // Delete the bid (soft or hard)
            if (permanent) {
              await bidRepo.hardDeleteBidTx(tx, bidId, currentBid.version);
            } else {
              await bidRepo.softDeleteBidTx(tx, bidId, currentBid.version, actorId);
            }

            // Update auction price if the deleted bid was the highest
            // Find the new highest bid after deletion
            const newHighestBid = await bidRepo.findNewHighestBidTx(tx, bid.auctionId);

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
            await bidRepo.updateAuctionTx(tx, bid.auctionId, currentAuction.version, {
              currentPrice: newCurrentPrice,
              highestBidId: newHighestBidId,
              version: { increment: 1 },
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
        if (error.code === 'P2025' || error.message.includes('version') || error.message.includes('concurrent') || error.message.includes('optimistic')) {
          retries++;
          if (retries === MAX_RETRIES) {
            logger.error('Bid deletion failed after max retries', {
              totalRetries: retries,
              auctionId: bid.auctionId,
              errorCode: error.code,
              errorMessage: error.message,
            });
            throw new AppError('CONCURRENT_MODIFICATION', 'Failed to process bid cancellation due to concurrent modifications. Please try again.', 409);
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
      logger.info('Bid deletion completed', {
        auctionId: bid.auctionId,
        oldPrice: bid.auction.currentPrice,
        newPrice: result.newPrice,
      });
    }

    res.status(200).json({
      success: true,
      message: `Bid ${permanent ? 'permanently deleted' : 'cancelled'} successfully`,
    });
  } catch (error) {
    logger.error('Delete bid error:', {
      error: error.message,
      bidId: req.params.bidId,
      deletedById: req.user.id,
    });

    next(error);
  }
};

/*
// @desc    Restore a soft-deleted bid
// @route   POST /api/bids/:bidId/restore
// @access  Private (Admin only)
export const restoreBid = async (req, res, next) => {
  try {
    const { bidId } = req.params;

    // Only admins can restore bids
    if (req.user.role !== 'admin') {
      throw new AppError('UNAUTHORIZED', 'Only admins can restore deleted bids', 403);
    }

    const bid = await prisma.bid.findUnique({
      where: { id: bidId },
      include: {
        auction: {
          select: {
            status: true,
            endDate: true,
          }
        }
      }
    });

    if (!bid) {
      throw new AppError('BID_NOT_FOUND', 'Bid not found', 404);
    }

    if (!bid.isDeleted) {
      throw new AppError('BID_NOT_CANCELLED', 'Bid is not cancelled', 400);
    }

    if (bid.auction.status !== 'active' || bid.auction.endDate < new Date()) {
      throw new AppError('AUCTION_NOT_ACTIVE', 'Cannot restore bid on inactive auction', 400);
    }

    const result = await prisma.$transaction(async (tx) => {
      // Restore the bid
      await tx.bid.update({
        where: { id: bidId },
        data: { isDeleted: false, deletedAt: null, deletedById: null, version: { increment: 1 } },
      });

      // Find the new highest bid
      const newHighestBid = await tx.bid.findFirst({
        where: { auctionId: bid.auctionId, isDeleted: false, isOutbid: false },
        orderBy: [{ amount: 'desc' }, { createdAt: 'asc' }],
        take: 1,
        select: { id: true, amount: true },
      });

      // Update auction if this bid is now the highest
      if (newHighestBid?.id === bidId) {
        await tx.auction.update({
          where: { id: bid.auctionId },
          data: {
            currentPrice: newHighestBid.amount,
            highestBidId: bidId,
            version: { increment: 1 },
          },
        });
      }

      return newHighestBid;
    });

    logger.info('Bid restored successfully', {
      bidId: bidId,
      restoredById: req.user?.id,
    });

    res.status(200).json({
      success: true,
      message: 'Bid restored successfully',
      ...(result ? { newHighestBid: result.id } : {}),
    });
  } catch (error) {
    logger.error('Restore bid error:', {
      error: error.message,
      bidId: req.params.bidId,
      restoredById: req.user?.id,
    });

    next(error);
  }
};
*/

// @desc    Get bids by auction
// @route   GET /api/bids/auction/:auctionId
// @access  Public
export const getBidsByAuction = async (req, res, next) => {
  try {
    const { auctionId } = req.params;
    const {
      page = 1,
      limit = 10,
      sort = 'createdAt',
      order = 'desc',
      status,
      bidderId,
      minAmount,
      maxAmount,
      startDate,
      endDate,
      fields
    } = req.query;

    // Check if auction exists
    const auction = await prisma.auction.findUnique({
      where: { id: auctionId, isDeleted: false },
      select: { id: true, status: true, sellerId: true },
    });

    if (!auction) {
      throw new AppError('AUCTION_NOT_FOUND', 'Auction not found', 404);
    }

    const isAdmin = req.user?.role === 'admin';
    const isSeller = req.user?.id === auction.sellerId;

    // Check if user has permission to see deleted bids
    // Only admin OR the auction seller can see cancelled bids
    if ((status === 'cancelled') && !isAdmin && !isSeller) {
      throw new AppError('NOT_AUTHORIZED', 'Not authorized to view cancelled bids', 403);
    }

    // Use the repository to get paginated and filtered bids
    const { data: bids, pagination } = await bidRepo.listAllBidsPrisma({
      auctionId,
      page: parseInt(page),
      limit: parseInt(limit),
      sort,
      order,
      status,
      bidderId,
      minAmount: minAmount ? parseFloat(minAmount) : undefined,
      maxAmount: maxAmount ? parseFloat(maxAmount) : undefined,
      startDate,
      endDate,
      fields: fields?.split(',').map(f => f.trim())
    });

    res.status(200).json({
      status: 'success',
      pagination,
      data: {
        bids,
      },
    });
  } catch (error) {
    logger.error('Get bids by auction error:', { error: error.message, stack: error.stack });
    next(error);
  }
};

// @desc    Get my bids
// @route   GET /api/bids/me
// @access  Private
export const getMyBids = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      sort = 'createdAt',
      order = 'desc',
      status,
      auctionId,
      minAmount,
      maxAmount,
      startDate,
      endDate,
      fields,
    } = req.query;

    const userId = req.user.id;

    // First, get all the user's bids
    const { data: bids, pagination } = await bidRepo.listAllBidsPrisma({
      bidderId: userId,
      page: parseInt(page),
      limit: parseInt(limit),
      sort,
      order,
      status,
      auctionId,
      minAmount: minAmount ? parseFloat(minAmount) : undefined,
      maxAmount: maxAmount ? parseFloat(maxAmount) : undefined,
      startDate,
      endDate,
      fields: fields?.split(',').map(f => f.trim()),
    });

    res.status(200).json({
      status: 'success',
      pagination,
      data: {
        bids,
      },
    });
  } catch (error) {
    logger.error('Error fetching my bids:', {
      error: error.message,
      stack: error.stack,
      query: req.query,
      userId: req.user.id,
    });
    next(error);
  }
};


/**
 * @desc    Get all bids with optional filtering
 * @route   GET /api/bids
 * @access  Admin
 */
export const getAllBids = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      sort = 'createdAt',
      order = 'desc',
      status,
      auctionId,
      bidderId,
      minAmount,
      maxAmount,
      startDate,
      endDate,
      fields
    } = req.query;

    const isAdmin = req.user?.role === 'admin';

    // Check if user has permission to view all bids
    if (!isAdmin) {
      throw new AppError('NOT_AUTHORIZED', 'Not authorized to view all bids', 403);
    }

    // Use the repository to get paginated and filtered bids
    const { data: bids, pagination } = await bidRepo.listAllBidsPrisma({
      page: parseInt(page),
      limit: parseInt(limit),
      sort,
      order,
      status,
      auctionId,
      bidderId,
      minAmount: minAmount ? parseFloat(minAmount) : undefined,
      maxAmount: maxAmount ? parseFloat(maxAmount) : undefined,
      startDate,
      endDate,
      fields: fields?.split(',').map(f => f.trim())
    });

    res.status(200).json({
      status: 'success',
      pagination,
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
    next(error);
  }
};



// ----- Additional repository helpers used by bidController -----


export async function findBidsByIds(tx, ids) {
  const p = tx ?? prisma;
  return p.bid.findMany({ where: { id: { in: ids } }, select: { id: true, version: true, isOutbid: true } });
}

export async function updateBidWithVersion(tx, id, version, data) {
  const p = tx ?? prisma;
  return p.bid.update({ where: { id, version }, data });
}

export async function getAuctionById(tx, auctionId, select = { id: true, status: true, currentPrice: true, bidIncrement: true, endDate: true, sellerId: true, version: true }) {
  const p = tx ?? prisma;
  return p.auction.findUnique({ where: { id: auctionId }, select });
}

export async function createBidTx(tx, { amount, auctionId, bidderId }) {
  const p = tx ?? prisma;
  return p.bid.create({
    data: { amount, auctionId, bidderId, version: 1, isOutbid: false },
    select: { id: true, amount: true, createdAt: true, bidder: { select: { id: true, username: true } } },
  });
}

export async function countBidsTx(tx, auctionId) {
  const p = tx ?? prisma;
  return p.bid.count({ where: { auctionId, isDeleted: false } });
}

export async function findNewHighestBidTx(tx, auctionId) {
  const p = tx ?? prisma;
  return p.bid.findFirst({
    where: { auctionId, isDeleted: false, isOutbid: false },
    orderBy: [{ amount: 'desc' }, { createdAt: 'asc' }],
    take: 1,
    select: { id: true, amount: true },
  });
}

export async function updateAuctionTx(tx, auctionId, version, data) {
  const p = tx ?? prisma;
  return p.auction.update({ where: { id: auctionId, version }, data });
}

export async function softDeleteBidTx(tx, bidId, version, actorId) {
  const p = tx ?? prisma;
  return p.bid.update({
    where: { id: bidId, version },
    data: { isDeleted: true, deletedAt: new Date(), deletedById: actorId, version: { increment: 1 } },
  });
}

export async function hardDeleteBidTx(tx, bidId, version) {
  const p = tx ?? prisma;
  return p.bid.delete({ where: { id: bidId, version } });
}

export async function findBidById(bidId, include = {}) {
  return prisma.bid.findUnique({ where: { id: bidId }, include });
}
