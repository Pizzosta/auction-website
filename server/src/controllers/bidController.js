import Bid from '../models/Bid.js';
import Auction from '../models/Auction.js';

export const placeBid = async (req, res) => {
  try {
    const { auctionId, amount } = req.body;

    // Find the auction
    const auction = await Auction.findById(auctionId);

    if (!auction) {
      return res.status(404).json({ message: 'Auction not found' });
    }

    // Check if auction is active
    if (auction.status !== 'active') {
      return res.status(400).json({ message: 'This auction is not active' });
    }

    // Check if auction has ended
    if (new Date(auction.endDate) < new Date()) {
      auction.status = 'ended';
      await auction.save();
      return res.status(400).json({ message: 'This auction has already ended' });
    }

    // Check if bid amount is higher than current price
    if (amount <= auction.currentPrice) {
      return res.status(400).json({
        message: `Bid amount must be higher than $${auction.currentPrice}`,
      });
    }

    // Check if user is not the seller
    if (auction.seller.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'You cannot bid on your own auction' });
    }

    // Create new bid
    const bid = new Bid({
      amount,
      auction: auction._id,
      bidder: req.user._id,
    });

    // Save bid
    await bid.save();

    // Update auction current price
    auction.currentPrice = amount;

    // If this is the first bid, set the end date to 10 minutes from now
    // (optional: you can remove this if you want fixed end times)
    if (auction.bids.length === 0) {
      const tenMinutesFromNow = new Date();
      tenMinutesFromNow.setMinutes(tenMinutesFromNow.getMinutes() + 10);
      auction.endDate = tenMinutesFromNow;
    }

    await auction.save();

    // Populate bid with user info
    const populatedBid = await bid.populate('bidder', 'username');

    // Emit socket event for real-time updates
    req.io.to(auctionId).emit('newBid', {
      auctionId: auction._id,
      amount,
      bidder: {
        _id: req.user._id,
        username: req.user.username,
      },
      createdAt: bid.createdAt,
    });

    res.status(201).json(populatedBid);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getBidsByAuction = async (req, res) => {
  try {
    const { auctionId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const bids = await Bid.find({ auction: auctionId })
      .sort({ amount: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('bidder', 'username');

    const count = await Bid.countDocuments({ auction: auctionId });

    res.json({
      bids,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getMyBids = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const bids = await Bid.find({ bidder: req.user._id })
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('auction', 'title currentPrice endDate status');

    const count = await Bid.countDocuments({ bidder: req.user._id });

    res.json({
      bids,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};
