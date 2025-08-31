import Auction from '../models/Auction.js';
import Bid from '../models/Bid.js';
import getCloudinary from '../config/cloudinary.js';

// @desc    Create a new auction
// @route   POST /api/auctions
// @access  Private
export const createAuction = async (req, res) => {
  try {
    const { title, description, startingPrice, endDate, category } = req.body;

    // Ensure at least one image is uploaded
    if (!req.uploadedFiles || req.uploadedFiles.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one image is required for the auction',
      });
    }

    const images = req.uploadedFiles;

    const auction = new Auction({
      title,
      description,
      startingPrice,
      currentPrice: startingPrice,
      endDate: new Date(endDate),
      images: images.map(file => ({
        url: file.url,
        publicId: file.publicId,
      })),
      category,
      seller: req.user._id,
    });

    const createdAuction = await auction.save();

    // Populate seller details
    await createdAuction.populate('seller', 'username email');

    res.status(201).json({
      success: true,
      message: 'Auction created successfully',
      data: createdAuction
    });
  } catch (error) {
    console.error('Error creating auction:', error);

    // If there was an error, clean up any uploaded files
    if (req.uploadedFiles && req.uploadedFiles.length > 0) {
      try {
        const cloudinary = await getCloudinary();
        await Promise.all(
          req.uploadedFiles.map(file =>
            cloudinary.uploader.destroy(file.publicId).catch(console.error)
          )
        );
      } catch (cleanupError) {
        console.error('Error cleaning up uploaded files:', cleanupError);
      }
    }

    res.status(500).json({
      success: false,
      message: 'Server error while creating auction',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Get all auctions
// @route   GET /api/auctions
// @access  Public
export const getAuctions = async (req, res) => {
  try {
    // Get pagination parameters (already validated by middleware)
    const { status, category, minPrice, maxPrice, search, endingSoon, page = 1, limit = 10, sort } = req.query;
    const skip = (page - 1) * limit;

    // Build sort object if sort parameter is provided
    const sortOptions = {};
    if (sort) {
      const [field, order] = sort.split(':');
      sortOptions[field] = order === 'desc' ? -1 : 1;
    } else {
      // Default sort by creation date (newest first)
      sortOptions.createdAt = -1;
    }

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
        $lte: new Date(Date.now() + 24 * 60 * 60 * 1000) // Next 24 hours
      };
    }

    // Search by title, description, or category if search query is provided
    if (search) {
      // Use regex for case-insensitive search across multiple fields
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { title: searchRegex },
        { description: searchRegex },
        { category: searchRegex },
      ];
    }

    // Execute query with pagination and sorting
    const auctions = await Auction.find(query)
      .sort(sortOptions)
      .limit(parseInt(limit))
      .skip(skip)
      .populate('seller', 'username avatarUrl')
      .populate('winner', 'username avatarUrl');

    // Get total count for pagination
    const count = await Auction.countDocuments(query);
    const totalPages = Math.ceil(count / limit);

    res.status(200).json({
      status: 'success',
      currentPage: parseInt(page),
      totalAuctions: count,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
      data: {
        auctions
      }
    });
  } catch (error) {
    logger.error('Get all auctions error:', {
      error: error.message,
      stack: error.stack,
      query: req.query
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
      .populate('winner', 'username');

    if (auction) {
      res.json(auction);
    } else {
      res.status(404).json({ message: 'Auction not found' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Update auction
// @route   PUT /api/auctions/:id
// @access  Private/Owner or Admin
export const updateAuction = async (req, res) => {
  try {
    const { title, description, startingPrice, endDate, images, category } = req.body;
    const auctionId = req.params.id;

    // Validate auction ID
    if (!auctionId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid auction ID format'
      });
    }

    // Find the auction
    const auction = await Auction.findById(auctionId);
    if (!auction) {
      return res.status(404).json({
        success: false,
        message: 'Auction not found'
      });
    }

    // Check if user is the owner or admin
    if (auction.seller.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this auction'
      });
    }

    // Check if auction has ended
    if (new Date(auction.endDate) < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot update an auction that has already ended'
      });
    }

    // Update fields if provided
    const updates = {};
    if (title) updates.title = title;
    if (description) updates.description = description;
    if (startingPrice !== undefined) updates.startingPrice = Number(startingPrice);
    if (endDate) updates.endDate = new Date(endDate);
    if (category) updates.category = category;

    // Handle images if provided
    if (images && Array.isArray(images)) {
      // Delete old images from Cloudinary if they're being replaced
      if (auction.images && auction.images.length > 0) {
        try {
          const cloudinary = await getCloudinary();
          await Promise.all(
            auction.images.map(async (img) => {
              if (img.publicId) {
                await cloudinary.uploader.destroy(img.publicId);
              }
            })
          );
        } catch (error) {
          console.error('Error deleting old images:', error);
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
      data: updatedAuction
    });
  } catch (error) {
    console.error('Update auction error:', error);
    res.status(500).json({
      success: false,
      message: error.name === 'ValidationError'
        ? Object.values(error.errors).map(val => val.message).join(', ')
        : 'Server error while updating auction'
    });
  }
};

// @desc    Delete auction
// @route   DELETE /api/auctions/:id
// @access  Private/Owner or Admin
export const deleteAuction = async (req, res) => {
  //const session = await Auction.startSession();
  //session.startTransaction();

  try {
    const auctionId = req.params.id;

    // Validate auction ID
    if (!auctionId.match(/^[0-9a-fA-F]{24}$/)) {
      //await session.abortTransaction();
      //session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Invalid auction ID format'
      });
    }

    // Find the auction
    const auction = await Auction.findById(auctionId)//.session(session);
    if (!auction) {
      //await session.abortTransaction();
      //session.endSession();
      return res.status(404).json({
        success: false,
        message: 'Auction not found'
      });
    }

    // Check if user is the owner or admin
    if (auction.seller.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      //await session.abortTransaction();
      //session.endSession();
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this auction'
      });
    }

    // Delete images from Cloudinary if they exist
    if (auction.images && auction.images.length > 0) {
      try {
        const cloudinary = await getCloudinary();
        await Promise.all(
          auction.images.map(async (img) => {
            if (img.publicId) {
              await cloudinary.uploader.destroy(img.publicId);
            }
          })
        );
      } catch (error) {
        console.error('Error deleting images from Cloudinary:', error);
        // Continue with the deletion even if image deletion fails
      }
    }

    // Delete all bids associated with this auction
    await Bid.deleteMany({ auction: auction._id })//.session(session);

    // Delete the auction
    await Auction.deleteOne({ _id: auction._id })//.session(session);

    //await session.commitTransaction();
    //session.endSession();

    res.status(200).json({
      success: true,
      message: 'Auction and all associated bids have been deleted',
      data: { id: auctionId }
    });
  } catch (error) {
    //await session.abortTransaction();
    //session.endSession();

    console.error('Delete auction error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting auction',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
