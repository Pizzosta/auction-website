import { Prisma } from '@prisma/client';
import prisma from '../config/prisma.js';
import getCloudinary from '../config/cloudinary.js';
import logger from '../utils/logger.js';
import { listAuctionsPrisma } from '../repositories/auctionRepo.prisma.js';

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

    const sellerId = req.user?.id?.toString();
    const createdAuction = await prisma.auction.create({
      data: {
        title,
        description,
        category: category || null,
        startingPrice: new Prisma.Decimal(startingPrice),
        currentPrice: new Prisma.Decimal(startingPrice),
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        bidIncrement: new Prisma.Decimal(bidIncrement),
        images: images || [],
        sellerId,
      },
      include: {
        seller: { select: { username: true, email: true, role: true } },
      },
    });

    res.status(201).json({
      success: true,
      message: 'Auction created successfully',
      data: createdAuction,
    });
  } catch (error) {
    logger.error('Error creating auction:', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
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
    const { 
      page = 1, 
      limit = 10, 
      sort = 'createdAt:desc',
      status,
      category,
      search,
      seller,
      winner,
      minPrice,
      maxPrice,
      startDate,
      endDate,
      endingSoon,
      fields,
      showDeleted,
    } = req.query;

    // Use the repository to get paginated and filtered auctions
    const { auctions, count, pageNum, take } = await listAuctionsPrisma({
      status,
      category,
      search,
      seller,
      winner,
      minPrice,
      maxPrice,
      startDate,
      endDate,
      endingSoon: endingSoon === 'true',
      page,
      limit,
      sort,
      showDeleted: showDeleted === 'true',
    });

    // Field selection
    let resultAuctions = auctions;
    if (fields) {
      const fieldList = fields.split(',').map(f => f.trim());
      resultAuctions = auctions.map(auction => {
        const filtered = {};
        fieldList.forEach(field => {
          if (auction[field] !== undefined) {
            filtered[field] = auction[field];
          }
        });
        return filtered;
      });
    }

    const totalPages = Math.ceil(count / take);
    const hasNext = pageNum < totalPages;
    const hasPrev = pageNum > 1;

    res.status(200).json({
      status: 'success',
      results: resultAuctions.length,
      pagination: {
        currentPage: pageNum,
        total: count,
        totalPages,
        hasNext,
        hasPrev,
      },
      data: {
        auctions: resultAuctions,
      },
    });
  } catch (error) {
    logger.error('Error fetching auctions:', { error: error.message, stack: error.stack });
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch auctions',
    });
  }
};

// @desc    Get single auction
// @route   GET /api/auctions/:id
// @access  Public
export const getAuctionById = async (req, res) => {
  try {
    const auction = await prisma.auction.findUnique({
      where: { id: req.params.id },
      include: {
        seller: { select: { username: true } },
        winner: { select: { username: true } },
      },
    });

    if (auction) {
      res.json({
        status: 'success',
        data: {
          ...auction,
        },
      });
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

    // Find the auction
    const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
    if (!auction) {
      return res.status(404).json({
        success: false,
        message: 'Auction not found',
      });
    }

    // Check if user is the owner or admin
    const actorId = req.user?.id?.toString();
    if (auction.sellerId.toString() !== actorId && req.user.role !== 'admin') {
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

    // Handle images if provided (delete old images)
    if (images && Array.isArray(images)) {
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
            userId: actorId,
          });
          // Continue with the update even if image deletion fails
        }
      }
      updates.images = images;
    }

    const updatedAuction = await prisma.auction.update({ where: { id: auctionId }, data: updates });

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
      userId: req.user?.id,
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

    // Find the auction
    const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
    if (!auction) {
      //await session.abortTransaction();
      //session.endSession();
      return res.status(404).json({
        success: false,
        message: 'Auction not found',
      });
    }

    // Check if user is the owner or admin
    const actorId = req.user?.id?.toString();
    if (auction.sellerId.toString() !== actorId && req.user.role !== 'admin') {
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
    if (new Date(auction.startDate) <= new Date() && req.user.role !== 'admin') {
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
            auctionId: auction.id,
            userId: actorId,
          });
          // Continue with deletion even if image deletion fails
        }
      }

      // Permanently delete auction and associated bids
      await prisma.$transaction([
        prisma.bid.deleteMany({ where: { auctionId } }),
        prisma.auction.delete({ where: { id: auctionId } }),
      ]);
    } else {
      // Soft delete
      await prisma.auction.update({
        where: { id: auctionId },
        data: { isDeleted: true, deletedAt: new Date(), deletedById: actorId },
      });
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
      userId: actorId,
      permanent,
    });
    return res.status(500).json({
      success: false,
      message: 'Error deleting auction',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};
