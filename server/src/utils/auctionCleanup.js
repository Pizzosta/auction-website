import Auction from '../models/Auction.js';
import Bid from '../models/Bid.js';
import User from '../models/User.js';
import { sendEmail } from './emailService.js';

/**
 * Check and close expired auctions
 * This function should be called periodically (e.g., every minute) using a job scheduler
 */
export const closeExpiredAuctions = async () => {
  try {
    // Find all active auctions that have passed their end date
    const expiredAuctions = await Auction.find({
      status: 'active',
      endDate: { $lte: new Date() },
    }).populate('seller', 'email username');

    // Process each expired auction
    for (const auction of expiredAuctions) {
      try {
        // Find the highest bid for this auction
        const highestBid = await Bid.findOne({ auction: auction._id })
          .sort('-amount')
          .populate('bidder', 'email username');

        if (highestBid) {
          // Update auction status to 'sold' and set the winner
          auction.status = 'sold';
          auction.winner = highestBid.bidder._id;
          await auction.save();

          // Mark the winning bid
          await Bid.updateOne({ _id: highestBid._id }, { isWinningBid: true });

          // Send notification to the seller
          await sendEmail({
            to: auction.seller.email,
            subject: 'Your auction has ended',
            template: 'auctionEndedSeller',
            context: {
              username: auction.seller.username,
              title: auction.title,
              amount: highestBid.amount,
              winner: highestBid.bidder.username,
              auctionId: auction._id,
            },
          });

          // Send notification to the winner
          await sendEmail({
            to: highestBid.bidder.email,
            subject: 'You won an auction!',
            template: 'auctionWon',
            context: {
              username: highestBid.bidder.username,
              title: auction.title,
              amount: highestBid.amount,
              seller: auction.seller.username,
              auctionId: auction._id,
            },
          });
        } else {
          // No bids, just mark as ended
          auction.status = 'ended';
          await auction.save();

          // Notify seller that auction ended with no bids
          await sendEmail({
            to: auction.seller.email,
            subject: 'Your auction has ended with no bids',
            template: 'auctionEndedNoBids',
            context: {
              username: auction.seller.username,
              title: auction.title,
              auctionId: auction._id,
            },
          });
        }
      } catch (error) {
        console.error(`Error processing expired auction ${auction._id}:`, error);
        // Continue with the next auction even if one fails
        continue;
      }
    }

    console.log(`Processed ${expiredAuctions.length} expired auctions`);
    return { processed: expiredAuctions.length };
  } catch (error) {
    console.error('Error in closeExpiredAuctions:', error);
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

    // Find and remove old completed auctions
    const result = await Auction.deleteMany({
      status: { $in: ['ended', 'sold'] },
      updatedAt: { $lt: thirtyDaysAgo },
    });

    console.log(`Cleaned up ${result.deletedCount} old auctions`);
    return result;
  } catch (error) {
    console.error('Error in cleanupOldData:', error);
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
    const endingAuctions = await Auction.find({
      status: 'active',
      endDate: {
        $lte: oneHourFromNow,
        $gt: new Date(),
      },
    }).populate('seller', 'email username');

    for (const auction of endingAuctions) {
      try {
        // Get bidders for this auction
        const bidders = await Bid.find({ auction: auction._id }).distinct('bidder');

        // Get user details for bidders
        const users = await User.find({ _id: { $in: bidders } });

        // Send reminder to each bidder
        for (const user of users) {
          await sendEmail({
            to: user.email,
            subject: 'Auction ending soon!',
            template: 'auctionEndingReminder',
            context: {
              username: user.username,
              title: auction.title,
              endTime: auction.endDate,
              auctionId: auction._id,
            },
          });
        }
      } catch (error) {
        console.error(`Error sending reminders for auction ${auction._id}:`, error);
        continue;
      }
    }

    console.log(`Sent reminders for ${endingAuctions.length} auctions`);
    return { reminded: endingAuctions.length };
  } catch (error) {
    console.error('Error in sendAuctionEndingReminders:', error);
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
    const auctionsToStart = await Auction.find({
      status: 'upcoming',
      startDate: { $lte: new Date() },
    });

    for (const auction of auctionsToStart) {
      auction.status = 'active';
      await auction.save();
      // Optionally notify seller that auction has started
      if (auction.seller && auction.seller.email) {
        await sendEmail({
          to: auction.seller.email,
          subject: 'Your auction has started',
          template: 'auctionStarted',
          context: {
            username: auction.seller.username,
            title: auction.title,
            auctionId: auction._id,
            startTime: auction.startDate,
          },
        });
      }
    }

    console.log(`Started ${auctionsToStart.length} auctions`);
    return { started: auctionsToStart.length };
  } catch (error) {
    console.error('Error in startScheduledAuctions:', error);
    throw error;
  }
};
