import Auction from '../models/Auction.js';
// We no longer need to import Bid since we're using Auction.permanentDelete
import getCloudinary from '../config/cloudinary.js';
import logger from '../utils/logger.js';

// @desc    Get all auctions with optional soft deleted
// @route   GET /api/auctions
// @access  Public/Admin for soft deleted
export const getAllAuctions = async (req, res) => {
  try {
    const { showDeleted = false, page = 1, limit = 10, sort = 'createdAt:desc' } = req.query;

    // Only admins can see soft-deleted auctions
    if (showDeleted && (!req.user || req.user.role !== 'admin')) {
      return res.status(403).json({
        status: 'error',
        message: 'Only admins can view deleted auctions',
      });
    }

    const query = Auction.find();

    if (showDeleted) {
      query.setQuery({ ...query.getQuery(), includeSoftDeleted: true });
    }

    const auctions = await query
      .populate('seller', 'username email')
      .sort({ [sort.split(':')[0]]: sort.split(':')[1] === 'desc' ? -1 : 1 })
      .limit(limit)
      .skip((page - 1) * limit);

    const count = await Auction.countDocuments(query.getQuery());

    res.json({
      success: true,
      data: {
        auctions,
        pagination: {
          total: count,
          pages: Math.ceil(count / limit),
          page: parseInt(page),
          limit: parseInt(limit),
        },
      },
    });
  } catch (error) {
    logger.error('Error getting auctions:', {
      error: error.message,
      stack: error.stack,
      query: req.query,
    });
    res.status(500).json({
      status: 'error',
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// @desc    Create a new auction
// @route   POST /api/auctions
// @access  Private
export const createAuction = async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      startingPrice,
      startDate,
      endDate,
      bidIncrement,
      images,
    } = req.body;

    // Create auction
    const auction = new Auction({
      title,
      description,
      category,
      startingPrice,
      currentPrice: startingPrice,
      startDate,
      endDate,
      bidIncrement,
      images,
      seller: req.user._id,
    });

    const createdAuction = await auction.save();

    // Populate seller details
    await createdAuction.populate('seller', 'username email');

    res.status(201).json({
      success: true,
      message: 'Auction created successfully',
      data: createdAuction,
    });
  } catch (error) {
    logger.error('Error creating auction:', {
      error: error.message,
      stack: error.stack,
      userId: req.user._id,
      auctionData: req.body,
    });

    // Clean up uploaded files in case of error
    if (req.uploadedFiles?.length > 0) {
      try {
        const cloudinary = await getCloudinary();
        await Promise.all(
          req.uploadedFiles.map(file =>
            cloudinary.uploader.destroy(file.publicId).catch(err =>
              logger.error('Error destroying uploaded file:', {
                error: err.message,
                stack: err.stack,
                publicId: file.publicId,
              })
            )
          )
        );
      } catch (cleanupError) {
        logger.error('Error cleaning up uploaded files:', {
          error: cleanupError.message,
          stack: cleanupError.stack,
          files: req.uploadedFiles,
        });
      }
    }

    res.status(500).json({
      success: false,
      message: 'Server error while creating auction',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// @desc    Get all auctions
// @route   GET /api/auctions
// @access  Public
export const getAuctions = async (req, res) => {
  try {
    // Get pagination parameters (already validated by middleware)
    const {
      status,
      category,
      startDate,
      endDate,
      minPrice,
      maxPrice,
      search,
      endingSoon,
      upcoming,
      page = 1,
      limit = 10,
      sort = 'createdAt:desc',
    } = req.query;

    // Parse pagination parameters
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(Math.max(1, parseInt(limit)), 100); // Cap at 100
    const skip = (pageNum - 1) * limitNum;

    // Build sort object if sort parameter is provided
    const [field, order] = sort.split(':');
    const sortOptions = {
      [field]: order === 'desc' ? -1 : 1,
    };

    // Build query
    const query = {};

    // Filter by status if provided
    if (status) query.status = status;

    // Filter by category if provided
    if (category) query.category = category;

    // Filter by price range if provided
    if (minPrice || maxPrice) {
      query.currentPrice = {};
      if (minPrice) query.currentPrice.$gte = Number(minPrice);
      if (maxPrice) query.currentPrice.$lte = Number(maxPrice);
    }

    // Filter for auctions ending soon (next 24 hours)
    if (endingSoon === 'true') {
      query.endDate = {
        $gte: new Date(),
        $lte: new Date(Date.now() + 24 * 60 * 60 * 1000), // Next 24 hours
      };
    }

    // Filter for upcoming auctions
    if (upcoming === 'true') {
      query.startDate = {
        $gte: new Date(), // Start date in the future
      };
    }

    // Filter by startDate range if provided
    if (startDate || endDate) {
      query.startDate = {};
      if (startDate) query.startDate.$gte = new Date(startDate);
      if (endDate) query.startDate.$lte = new Date(endDate);
    }

    // Search by title, description, or category if search query is provided
    if (search) {
      // Use regex for case-insensitive search across multiple fields
      const searchRegex = new RegExp(search, 'i');
      query.$or = [{ title: searchRegex }, { description: searchRegex }, { category: searchRegex }];
    }

    // Execute query with pagination and sorting
    const auctions = await Auction.find(query)
      .sort(sortOptions)
      .limit(limitNum)
      .skip(skip)
      .populate('seller', 'username avatarUrl')
      .populate('winner', 'username avatarUrl')
      .populate('highestBidder');

    // Get total count for pagination
    const count = await Auction.countDocuments(query);
    const totalPages = Math.ceil(count / limitNum);

    res.status(200).json({
      status: 'success',
      pagination: {
        currentPage: pageNum,
        totalAuctions: count,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
      data: {
        auctions,
      },
    });
  } catch (error) {
    logger.error('Get all auctions error:', {
      error: error.message,
      stack: error.stack,
      query: req.query,
    });

    res.status(500).json({
      status: 'error',
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// @desc    Get single auction
// @route   GET /api/auctions/:id
// @access  Public
export const getAuctionById = async (req, res) => {
  try {
    const auction = await Auction.findById(req.params.id)
      .populate('seller', 'username email')
      .populate('winner', 'username')
      .populate('highestBidder');

    if (auction) {
      res.json(auction);
    } else {
      res.status(404).json({ message: 'Auction not found' });
    }
  } catch (error) {
    logger.error('Get auction by id error:', {
      error: error.message,
      stack: error.stack,
      auctionId: req.params.id,
    });
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Update auction
// @route   PUT /api/auctions/:id
// @access  Private/Owner or Admin
export const updateAuction = async (req, res) => {
  try {
    const { title, description, startingPrice, startDate, endDate, images, category } = req.body;
    const auctionId = req.params.id;

    // Validate auction ID
    if (!auctionId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid auction ID format',
      });
    }

    // Find the auction
    const auction = await Auction.findById(auctionId);
    if (!auction) {
      return res.status(404).json({
        success: false,
        message: 'Auction not found',
      });
    }

    // Check if user is the owner or admin
    if (auction.seller.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this auction',
      });
    }

    // Check if auction has started
    if (new Date(auction.startDate) <= new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot update an auction that has already started',
      });
    }

    // Check if auction has ended
    if (new Date(auction.endDate) < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot update an auction that has already ended',
      });
    }

    // Update fields if provided
    const updates = {};
    if (title) updates.title = title;
    if (description) updates.description = description;
    if (startingPrice !== undefined) updates.startingPrice = Number(startingPrice);
    if (startDate) updates.startDate = new Date(startDate);
    if (endDate) updates.endDate = new Date(endDate);
    if (category) updates.category = category;

    // Handle images if provided
    if (images && Array.isArray(images)) {
      // Delete old images from Cloudinary if they're being replaced
      if (auction.images && auction.images.length > 0) {
        try {
          const cloudinary = await getCloudinary();
          await Promise.all(
            auction.images.map(async img => {
              if (img.publicId) {
                await cloudinary.uploader.destroy(img.publicId);
              }
            })
          );
        } catch (error) {
          logger.error('Error deleting old images:', {
            error: error.message,
            stack: error.stack,
            auctionId,
            userId: req.user._id,
          });
          // Continue with the update even if image deletion fails
        }
      }
      updates.images = images;
    }

    // Find and update the auction
    const updatedAuction = await Auction.findByIdAndUpdate(
      auctionId,
      { $set: updates },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      data: updatedAuction,
    });
  } catch (error) {
    logger.error('Update auction error:', {
      error: error.message,
      stack: error.stack,
      errorName: error.name,
      auctionId,
      userId: req.user._id,
    });
    res.status(500).json({
      success: false,
      message:
        error.name === 'ValidationError'
          ? Object.values(error.errors)
              .map(val => val.message)
              .join(', ')
          : 'Server error while updating auction',
    });
  }
};

// @desc    Delete auction
// @route   DELETE /api/auctions/:id
// @access  Private/Owner or Admin
export const deleteAuction = async (req, res) => {
  try {
    const { permanent = false } = req.body;
    const auctionId = req.params.id;

    // Validate auction ID
    if (!auctionId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid auction ID format',
      });
    }

    // Find the auction
    const auction = await Auction.findById(auctionId).select('+isDeleted');
    if (!auction) {
      //await session.abortTransaction();
      //session.endSession();
      return res.status(404).json({
        success: false,
        message: 'Auction not found',
      });
    }

    // Check if user is the owner or admin
    if (auction.seller.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      //await session.abortTransaction();
      //session.endSession();
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this auction',
      });
    }

    // Only admins can perform permanent deletion
    if (permanent && (!req.user || req.user.role !== 'admin')) {
      return res.status(403).json({
        success: false,
        message: 'Only admins can permanently delete auctions',
      });
    }

    // Check if auction has started (for non-admin users)
    if (auction.startDate <= new Date() && req.user.role !== 'admin') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete an auction that has already started',
      });
    }

    if (permanent) {
      // Delete images from Cloudinary if they exist
      if (auction.images && auction.images.length > 0) {
        try {
          const cloudinary = await getCloudinary();
          await Promise.all(
            auction.images.map(async img => {
              if (img.publicId) {
                await cloudinary.uploader.destroy(img.publicId);
              }
            })
          );
        } catch (error) {
          logger.error('Error deleting images:', {
            error: error.message,
            stack: error.stack,
            auctionId: auction._id,
            userId: req.user._id,
          });
          // Continue with deletion even if image deletion fails
        }
      }

      // Permanently delete auction and associated bids
      await Auction.permanentDelete(auction._id);
    } else {
      // Soft delete
      await auction.softDelete(req.user._id);
    }

    // await session.commitTransaction();
    // session.endSession();

    res.status(200).json({
      success: true,
      message: 'Auction and all associated bids have been deleted',
      data: { id: auctionId },
    });
  } catch (error) {
    // await session.abortTransaction();
    // session.endSession();

    logger.error('Delete auction error:', {
      error: error.message,
      stack: error.stack,
      auctionId,
      userId: req.user._id,
      permanent,
    });
    return res.status(500).json({
      success: false,
      message: 'Error deleting auction',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};
