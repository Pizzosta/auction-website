import Bid from '../models/Bid.js';
import Auction from '../models/Auction.js';
import mongoose from 'mongoose';
import logger from '../utils/logger.js';

// @desc    Place a bid on an auction
// @route   POST /api/bids
// @access  Private
export const placeBid = async (req, res) => {
  try {
    const { auctionId, amount } = req.body;

    // Find the auction
    const auction = await Auction.findById(auctionId);

    if (!auction) {
      return res.status(404).json({ success: false, message: 'Auction not found' });
    }

    // Enforce bid increment
    const minAllowedBid = auction.currentPrice + auction.bidIncrement;
    if (amount < minAllowedBid) {
      return res.status(400).json({
        success: false,
        message: `Bid must be at least ${auction.bidIncrement} higher than current price (${minAllowedBid})`,
      });
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

// @desc    Get bids by auction
// @route   GET /api/bids/auction/:auctionId
// @access  Public
export const getBidsByAuction = async (req, res) => {
  try {
    const { auctionId } = req.params;
    const { page = 1, limit = 10, sort = 'amount:desc' } = req.query;

    // Validate auction ID
    if (!mongoose.Types.ObjectId.isValid(auctionId)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid auction ID format',
      });
    }

    // Check if auction exists
    const auctionExists = await Auction.exists({ _id: auctionId });
    if (!auctionExists) {
      return res.status(404).json({
        status: 'error',
        message: 'Auction not found',
      });
    }

    // Parse pagination parameters
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(Math.max(1, parseInt(limit)), 100); // Cap at 100
    const skip = (pageNum - 1) * limitNum;

    // Build sort object if sort parameter is provided
    const [sortField, sortOrder] = sort.split(':');
    const sortOptions = {
      [sortField]: sortOrder === 'asc' ? 1 : -1,
    };

    // Execute query
    const bids = await Bid.find({ auction: auctionId })
      .sort(sortOptions)
      .limit(limitNum)
      .skip(skip)
      .populate('bidder', 'username avatarUrl rating')
      .lean(); // For better performance

    // Get total count for pagination
    const count = await Bid.countDocuments({ auction: auctionId });
    const totalPages = Math.ceil(count / limitNum);

    res.status(200).json({
      status: 'success',
      pagination: {
        currentPage: pageNum,
        totalBids: count,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      }, 
      data: {
        bids
      }
    });
  } catch (error) {
    logger.error('Get bids by auction error:', {
      error: error.message,
      auctionId: req.params.auctionId,
      userId: req.user?._id,
    });

    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve bids',
      ...(process.env.NODE_ENV === 'development' && { error: error.message }),
    });
  }
};

// @desc    Get my bids
// @route   GET /api/bids/me
// @access  Private
export const getMyBids = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;

    // Parse pagination parameters
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(Math.max(1, parseInt(limit)), 50); // Cap at 50 for user queries
    const skip = (pageNum - 1) * limitNum;

    // Build query
    const query = { bidder: req.user._id };

    // Add status filter if provided
    if (status) {
      query['auction.status'] = status;
    }

    // Execute query with population
    const bids = await Bid.find(query)
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .skip(skip)
      .populate({
        path: 'auction',
        select: 'title currentPrice endDate status images winner',
        populate: {
          path: 'winner',
          select: 'username',
        },
      })
      .lean();

    // Get total count
    const totalCount = await Bid.countDocuments({ bidder: req.user._id });
    const totalPages = Math.ceil(totalCount / limitNum);

    // Enhance bid data with additional information
    const enhancedBids = bids.map(bid => {
      const auction = bid.auction;
      const isWinning = auction.winner && auction.winner._id.toString() === req.user._id.toString();
      const isActive = auction.status === 'active';
      const isEnded = ['ended', 'sold'].includes(auction.status);

      return {
        ...bid,
        isWinning,
        auctionStatus: auction.status,
        timeRemaining: isActive ? new Date(auction.endDate) - new Date() : null,
        isActive,
        isEnded,
      };
    });

    res.status(200).json({
      status: 'success',
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalCount,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
      data: {
        bids: enhancedBids,
      },
    });
  } catch (error) {
    logger.error('Get my bids error:', {
      error: error.message,
      userId: req.user._id,
    });

    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve your bids',
      ...(process.env.NODE_ENV === 'development' && { error: error.message }),
    });
  }
};