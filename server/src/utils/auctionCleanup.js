import prisma from '../config/prisma.js';
import { sendEmail } from './emailService.js';
import logger from './logger.js';

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

        if (highestBid) {
          // Update auction status to 'sold' and set the winner
          await prisma.auction.update({
            where: { id: auction.id },
            data: { status: 'sold', winnerId: highestBid.bidderId },
          });

          // Send notification to the seller
          await sendEmail({
            to: auction.seller?.email,
            subject: 'Your auction has ended',
            template: 'auctionEndedSeller',
            context: {
              username: auction.seller?.username,
              title: auction.title,
              amount: highestBid.amount,
              winner: highestBid.bidder?.username,
              auctionId: auction.id,
            },
          });

          // Send notification to the winner
          await sendEmail({
            to: highestBid.bidder?.email,
            subject: 'You won an auction!',
            template: 'auctionWon',
            context: {
              username: highestBid.bidder?.username,
              title: auction.title,
              amount: highestBid.amount,
              seller: auction.seller?.username,
              auctionId: auction.id,
            },
          });
        } else {
          // No bids, just mark as ended
          await prisma.auction.update({ where: { id: auction.id }, data: { status: 'ended' } });

          // Notify seller that auction ended with no bids
          await sendEmail({
            to: auction.seller?.email,
            subject: 'Your auction has ended with no bids',
            template: 'auctionEndedNoBids',
            context: {
              username: auction.seller?.username,
              title: auction.title,
              auctionId: auction.id,
            },
          });
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
      where: { status: { in: ['ended', 'sold'] }, updatedAt: { lt: thirtyDaysAgo } },
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

    for (const auction of endingAuctions) {
      try {
        // Get distinct bidders for this auction
        const bids = await prisma.bid.findMany({
          where: { auctionId: auction.id },
          distinct: ['bidderId'],
          select: { bidder: { select: { email: true, username: true } } },
        });

        // Send reminder to each bidder
        for (const { bidder } of bids) {
          await sendEmail({
            to: bidder?.email,
            subject: 'Auction ending soon!',
            template: 'auctionEndingReminder',
            context: {
              username: bidder?.username,
              title: auction.title,
              endTime: auction.endDate,
              auctionId: auction.id,
            },
          });
        }
      } catch (error) {
        logger.error('Error sending auction reminders:', {
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
 * This function should be called periodically (e.g., every minute) using a job scheduler
 */
export const startScheduledAuctions = async () => {
  try {
    // Find all upcoming auctions whose startDate has passed
    const auctionsToStart = await prisma.auction.findMany({
      where: { status: 'upcoming', startDate: { lte: new Date() } },
      include: { seller: { select: { email: true, username: true } } },
    });

    for (const auction of auctionsToStart) {
      await prisma.auction.update({ where: { id: auction.id }, data: { status: 'active' } });
      // Optionally notify seller that auction has started
      if (auction.seller?.email) {
        await sendEmail({
          to: auction.seller.email,
          subject: 'Your auction has started',
          template: 'auctionStarted',
          context: {
            username: auction.seller.username,
            title: auction.title,
            auctionId: auction.id,
            startTime: auction.startDate,
          },
        });
      }
    }

    logger.info('Started scheduled auctions', {
      count: auctionsToStart.length,
    });
    return { started: auctionsToStart.length };
  } catch (error) {
    logger.error('Error in startScheduledAuctions:', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
};
