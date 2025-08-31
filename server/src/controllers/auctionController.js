import Auction from '../models/Auction.js';
import Bid from '../models/Bid.js';
import { v2 as cloudinary } from 'cloudinary';
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
    const { status, category, search, page = 1, limit = 10 } = req.query;

    const query = {};
    if (status) query.status = status;
    if (category) query.category = category;
    if (search) {
      query.$text = { $search: search };
    }

    const auctions = await Auction.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('seller', 'username')
      .populate('winner', 'username');

    const count = await Auction.countDocuments(query);

    res.json({
      auctions,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
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
    const { title, description, images, category } = req.body;
    const auction = await Auction.findById(req.params.id);

    if (!auction) {
      return res.status(404).json({ message: 'Auction not found' });
    }

    // Check if user is the owner or admin
    if (auction.seller.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(401).json({ message: 'Not authorized to update this auction' });
    }

    auction.title = title || auction.title;
    auction.description = description || auction.description;
    auction.images = images || auction.images;
    auction.category = category || auction.category;

    const updatedAuction = await auction.save();
    res.json(updatedAuction);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Delete auction
// @route   DELETE /api/auctions/:id
// @access  Private/Owner or Admin
export const deleteAuction = async (req, res) => {
  try {
    const auction = await Auction.findById(req.params.id);

    if (!auction) {
      return res.status(404).json({ message: 'Auction not found' });
    }

    // Check if user is the owner or admin
    if (auction.seller.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(401).json({ message: 'Not authorized to delete this auction' });
    }

    // Delete all bids associated with this auction
    await Bid.deleteMany({ auction: auction._id });

    // Delete the auction
    await Auction.deleteOne({ _id: auction._id });
    res.json({ message: 'Auction removed' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};
