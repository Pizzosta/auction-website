import prisma from '../config/prisma.js';
import { addToQueue } from '../services/emailQueue.js';
import logger from '../utils/logger.js';
import { formatDateTime, formatTimeRemaining } from '../utils/format.js'; 
/**
 * Check and close expired auctions
 * This function should be called periodically (e.g., every minute) using a job scheduler
 */
export const closeExpiredAuctions = async () => {
  try {
    // Find all active auctions that have passed their end date
    const expiredAuctions = await prisma.auction.findMany({
      where: { status: 'active', endDate: { lte: new Date() } },
      include: { seller: { select: { email: true, username: true } } },
    });

    // Process each expired auction
    for (const auction of expiredAuctions) {
      try {
        // Find the highest bid for this auction
        const highestBid = await prisma.bid.findFirst({
          where: { auctionId: auction.id },
          orderBy: { amount: 'desc' },
          include: { bidder: { select: { email: true, username: true } } },
        });

        try {
          if (highestBid) {
            // Update auction status to 'sold' and set the winner with version check
            const updatedAuction = await prisma.auction.update({
              where: {
                id: auction.id,
                version: auction.version // Optimistic concurrency control
              },
              data: {
                status: 'sold',
                winnerId: highestBid.bidderId,
                version: { increment: 1 }
              },
            });

            if (updatedAuction) {
              // Send notification to the seller
              await addToQueue('auctionEndedSeller', auction.seller?.email, {
                username: auction.seller?.username,
                title: auction.title,
                amount: highestBid.amount,
                winner: highestBid.bidder?.username,
                auctionUrl: `${process.env.FRONTEND_URL}/auctions/${auction.id}`,
                endDate: formatDateTime(auction.endDate),
              });

              // Send notification to the winner
              await addToQueue('auctionWon', highestBid.bidder?.email, {
                username: highestBid.bidder?.username,
                title: auction.title,
                amount: highestBid.amount,
                seller: auction.seller?.username,
                auctionUrl: `${process.env.FRONTEND_URL}/auctions/${auction.id}`,
                endDate: formatDateTime(auction.endDate),
              });
            }
          } else {
            // No bids, just mark as ended with version check
            const updatedAuction = await prisma.auction.update({
              where: {
                id: auction.id,
                version: auction.version // Optimistic concurrency control
              },
              data: {
                status: 'ended',
                version: { increment: 1 }
              }
            });

            if (updatedAuction) {
              // Notify seller that auction ended with no bids
              await addToQueue('auctionEndedNoBids', auction.seller?.email, {
                username: auction.seller?.username,
                title: auction.title,
                category: auction.category,
                startingPrice: auction.startingPrice,
                auctionUrl: `${process.env.FRONTEND_URL}/auctions/${auction.id}`,
                endDate: formatDateTime(auction.endDate),
              });
            }
          }
        } catch (error) {
          if (error.code === 'P2025') {
            logger.info('Auction already closed (race condition)', {
              auctionId: auction.id,
              currentVersion: auction.version
            });
            // Continue to next auction - it was already processed
            continue;
          }
          logger.error(`Failed to process expired auction ${auction.id}:`, error);
          // Continue with next auction even if one fails
          continue;
        }
      } catch (error) {
        logger.error('Error processing expired auction:', {
          error: error.message,
          stack: error.stack,
          auctionId: auction.id,
        });
        // Continue with the next auction even if one fails
        continue;
      }
    }

    logger.info('Processed expired auctions', {
      count: expiredAuctions.length,
    });
    return { processed: expiredAuctions.length };
  } catch (error) {
    logger.error('Error in closeExpiredAuctions:', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
};

/**
 * Clean up old data (e.g., completed auctions older than 30 days)
 */
export const cleanupOldData = async () => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Remove old completed auctions
    const result = await prisma.auction.deleteMany({
      where: { status: { in: ['ended', 'sold', 'completed'] }, updatedAt: { lt: thirtyDaysAgo } },
    });

    logger.info('Cleaned up old auctions', {
      count: result.count,
    });
    return result;
  } catch (error) {
    logger.error('Error in cleanupOldData:', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
};

/**
 * Send reminders for auctions ending soon
 */
export const sendAuctionEndingReminders = async () => {
  try {
    const oneHourFromNow = new Date();
    oneHourFromNow.setHours(oneHourFromNow.getHours() + 1);

    // Find auctions ending in the next hour
    const endingAuctions = await prisma.auction.findMany({
      where: { status: 'active', endDate: { lte: oneHourFromNow, gt: new Date() } },
      include: { seller: { select: { email: true, username: true } } },
    });

    logger.info('Found auctions ending soon', {
      count: endingAuctions.length,
      auctionIds: endingAuctions.map(a => a.id)
    });

    for (const auction of endingAuctions) {
      try {
        // Get distinct bidders for this auction with their max bid
        const bids = await prisma.bid.groupBy({
          by: ['bidderId'],
          where: { auctionId: auction.id },
          _max: {
            amount: true,
          },
          _count: {
            id: true,
          },
        });

        // Get bidder details for each unique bidder
        const bidderDetails = await Promise.all(
          bids.map(async (bid) => {
            const user = await prisma.user.findUnique({
              where: { id: bid.bidderId },
              select: { email: true, username: true },
            });
            return {
              ...user,
              maxBid: bid._max.amount,
            };
          })
        );

        // Send reminder to each bidder
        for (const bidder of bidderDetails) {
          try {
            await addToQueue('auctionEndingReminder', bidder?.email, {
              username: bidder?.username,
              title: auction.title,
              timeRemaining: formatTimeRemaining(auction.endDate),
              currentBid: auction.currentPrice,
              maxBid: bidder.maxBid,
              endDate: formatDateTime(auction.endDate),
              auctionUrl: `${process.env.FRONTEND_URL}/auctions/${auction.id}`,
            });
          } catch (error) {
            logger.error('Failed to queue ending reminder:', {
              error: error.message,
              auctionId: auction.id,
              bidderEmail: bidder?.email
            });
            // Continue with other bidders even if one fails
          }
        }
      } catch (error) {
        logger.error('Error processing auction reminders:', {
          error: error.message,
          stack: error.stack,
          auctionId: auction.id,
        });
        continue;
      }
    }

    logger.info('Sent auction ending reminders', {
      count: endingAuctions.length,
    });
    return { reminded: endingAuctions.length };
  } catch (error) {
    logger.error('Error in sendAuctionEndingReminders:', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
};

/**
 * Start auctions whose startDate has passed
 * @returns {Promise<{started: number, updated: number}>} Number of auctions started and updated
 */
export const startScheduledAuctions = async () => {
  let startedCount = 0;
  let updatedCount = 0;

  try {
    // Find all upcoming auctions whose startDate has passed
    const auctionsToStart = await prisma.auction.findMany({
      where: { status: 'upcoming', startDate: { lte: new Date() } },
      include: { seller: { select: { id: true, email: true, firstname: true } } },
    });

    if (auctionsToStart.length === 0) {
      return { started: 0, updated: 0 };
    }

    logger.info('Found auctions to start', {
      count: auctionsToStart.length,
      auctionIds: auctionsToStart.map(a => a.id)
    });

    // Update all auctions in a transaction
    const results = await prisma.$transaction(async (tx) => {
      const updatePromises = auctionsToStart.map(async (auction) => {
        try {
          // Update the auction status to active with version check to prevent race conditions
          const updatedAuction = await tx.auction.update({
            where: {
              id: auction.id,
              version: auction.version // Add version check to prevent race conditions
            },
            data: {
              status: 'active',
              version: { increment: 1 }
            },
          });

          // Send notification to the seller (outside transaction for reliability)
          try {
            await addToQueue('auctionStarted', auction.seller.email, {
              name: auction.seller.firstname,
              auctionTitle: auction.title,
              auctionUrl: `${process.env.FRONTEND_URL}/auctions/${auction.id}`,
              startDate: formatDateTime(auction.startDate),
              endDate: formatDateTime(auction.endDate),
            });
            updatedCount++;
          } catch (error) {
            logger.error('Failed to queue auction started notification:', {
              error: error.message,
              auctionId: auction.id,
              userId: auction.seller.id,
            });
            // Don't fail the transaction if email queuing fails
          }

          return updatedAuction;
        } catch (error) {
          // Handle race conditions where auction was already updated
          if (error.code === 'P2025') {
            logger.info('Auction already started (race condition)', {
              auctionId: auction.id,
              currentVersion: auction.version
            });

            // Check current auction status
            const currentAuction = await tx.auction.findUnique({
              where: { id: auction.id },
              select: { id: true, status: true, version: true, updatedAt: true }
            });

            if (currentAuction && currentAuction.status === 'active') {
              // Only send notification if auction was updated recently (within last 5 minutes)
              // This prevents sending duplicate notifications for auctions that were started long ago
              const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
              const wasRecentlyUpdated = currentAuction.updatedAt > fiveMinutesAgo;

              if (wasRecentlyUpdated) {
                try {
                  await addToQueue('auctionStarted', auction.seller.email, {
                    name: auction.seller.firstname,
                    auctionTitle: auction.title,
                    auctionUrl: `${process.env.FRONTEND_URL}/auctions/${auction.id}`,
                    startDate: formatDateTime(auction.startDate),
                    endDate: formatDateTime(auction.endDate),
                  });
                  updatedCount++;
                  logger.info('Sent auction started notification for recently-updated auction', {
                    auctionId: auction.id,
                    updatedAt: currentAuction.updatedAt
                  });
                } catch (emailError) {
                  logger.error('Failed to queue auction started notification for recently-updated auction:', {
                    error: emailError.message,
                    auctionId: auction.id,
                    userId: auction.seller.id,
                  });
                }
              } else {
                logger.info('Auction was updated long ago, skipping notification', {
                  auctionId: auction.id,
                  updatedAt: currentAuction.updatedAt,
                  fiveMinutesAgo: fiveMinutesAgo
                });
              }
              return currentAuction;
            } else {
              // Auction was updated to a different status, skip it
              logger.info('Auction updated to different status, skipping', {
                auctionId: auction.id,
                status: currentAuction?.status
              });
              return null;
            }
          }
          throw error; // Re-throw other errors
        }
      });

      return Promise.all(updatePromises);
    });

    startedCount = results.filter(result => result !== null).length;

    logger.info(`Started ${startedCount} auctions and sent ${updatedCount} notifications`);

    return { started: startedCount, updated: updatedCount };
  } catch (error) {
    logger.error('Error starting scheduled auctions:', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
};
