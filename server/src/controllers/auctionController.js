import getCloudinary from '../config/cloudinary.js';
import logger from '../utils/logger.js';
import {
  listAuctionsPrisma,
  createAuctionPrisma,
  findAuctionById,
  updateAuctionPrisma,
  softDeleteAuction,
  deleteAuctionPermanently,
  findAuctionPrisma,
  findDeletedAuction,
  restoreAuctionPrisma,
} from '../repositories/auctionRepo.prisma.js';
import { Prisma } from '@prisma/client';

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
    const auctionData = {
      title,
      description,
      category,
      startingPrice,
      bidIncrement,
      startDate,
      endDate,
      status: 'upcoming',
      images,
      sellerId,
    };

    const createdAuction = await createAuctionPrisma(auctionData);

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
// @route   GET /api/auctions/admin
// @access  Admin
export const getAuctions = async (req, res) => {
  try {
    const {
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
      page = 1,
      limit = 10,
      sort = 'createdAt:desc',
    } = req.query;

    const role = req.user?.role || null;

    // Only admins can see soft-deleted auctions
    if ((status === 'cancelled' || status === 'all') && role !== 'admin') {
      return res.status(403).json({
        status: 'error',
        message: 'Only admins can view deleted auctions',
      });
    }

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
      endingSoon,
      fields,
      page,
      limit,
      sort,
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
    logger.error('Error fetching auctions:', {
      error: error.message,
      stack: error.stack,
      query: req.query,
    });
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch auctions',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// @desc    Get public auctions
// @route   GET /api/auctions
// @access  Public
export const getPublicAuctions = async (req, res, next) => {
  // If user is trying to access admin-only statuses without being an admin
  if (['cancelled', 'all'].includes(req.query.status)) {
    return res.status(401).json({
      status: 'error',
      message: 'Authentication required to view these auctions',
    });
  }

  // If no restricted status is being accessed, continue with normal auction fetching
  return getAuctions(req, res, next);
};

export const getAuctionById = async (req, res) => {
  try {
    const { auctionId } = req.params;

    const auction = await findAuctionById(auctionId, {
      includeSeller: true,
      includeWinner: true,
    });

    if (auction) {
      res.json({
        status: 'success',
        data: {
          ...auction,
        },
      });
    } else {
      res.status(404).json({
        status: 'error',
        message: 'Auction not found',
      });
    }
  } catch (error) {
    logger.error('Get auction by id error:', {
      error: error.message,
      stack: error.stack,
      auctionId,
    });
    res.status(500).json({
      status: 'error',
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};


// @desc    Update auction
// @route   PUT /api/auctions/:id
// @access  Private/Owner or Admin
export const updateAuction = async (req, res) => {
  try {
    const { title, description, startingPrice, bidIncrement, startDate, endDate, images, category } = req.body;
    const { auctionId } = req.params;

    // Find the auction
    const auction = await findAuctionById(auctionId);
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
    const updateData = {};
    if (title) updateData.title = title;
    if (description) updateData.description = description;
    if (startingPrice !== undefined) {
      updateData.startingPrice = new Prisma.Decimal(startingPrice);
      // Update currentPrice to match the new startingPrice if it's being updated
      updateData.currentPrice = new Prisma.Decimal(startingPrice);
    }
    if (bidIncrement) updateData.bidIncrement = new Prisma.Decimal(bidIncrement);
    if (startDate) updateData.startDate = new Date(startDate);
    if (endDate) updateData.endDate = new Date(endDate);
    if (category) updateData.category = category;

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
      updateData.images = images;
    }

    const updatedAuction = await updateAuctionPrisma(auctionId, updateData, auction.version);

    res.status(200).json({
      success: true,
      data: updatedAuction,
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(409).json({
        success: false,
        message: 'This auction was modified by another user. Please refresh and try again.',
      });
    }
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
  const { auctionId } = req.params;
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
    // Find the auction with minimal required fields
    const auction = await findAuctionPrisma(auctionId);

    if (!auction) {
      return res.status(404).json({
        success: false,
        message: 'Auction not found',
      });
    }

    // Check if user is the owner or admin
    if (auction.sellerId.toString() !== actorId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this auction',
      });
    }

    // Only admins can perform permanent deletion
    if (permanent && req.user.role !== 'admin') {
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
      if (auction.images?.length > 0) {
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
          logger.error('Error deleting images:', {
            error: error.message,
            stack: error.stack,
            auctionId: auction.id,
            userId: actorId,
          });
          // Continue with deletion even if image deletion fails
        }
      }

      // Permanently delete auction (cascading deletes are handled by the database)
      await deleteAuctionPermanently(auctionId, auction.version);
    } else {
      // Soft delete with version check
      const updatedAuction = await softDeleteAuction(auctionId, actorId, auction.version);

      if (!updatedAuction) {
        throw new Error('Failed to soft delete auction - version mismatch');
      }
    }

    res.status(200).json({
      success: true,
      message: permanent
        ? 'Auction and all associated data have been permanently deleted'
        : 'Auction has been soft deleted',
      data: { id: auctionId },
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(409).json({
        success: false,
        message: 'This auction was modified by another user. Please refresh and try again.',
      });
    }

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

// @desc    Restore a soft-deleted auction (Admin only)
// @route   PATCH /api/auctions/:id/restore
// @access  Private/Admin
export const restoreAuction = async (req, res) => {
  const { auctionId } = req.params;
  const { role } = req.user;

  try {
    // Only admins can restore auctions
    if (role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can restore auctions',
      });
    }

    // Find the auction including soft-deleted ones
    const auction = await findAuctionPrisma(auctionId);

    if (!auction) {
      return res.status(404).json({
        success: false,
        message: 'Auction not found',
      });
    }

    // Check if auction is not soft-deleted (we need to fetch it again with isDeleted field)
    const auctionWithDeletedStatus = await findDeletedAuction(auctionId);

    if (!auctionWithDeletedStatus.isDeleted) {
      return res.status(400).json({
        success: false,
        message: 'Auction is not deleted',
      });
    }

    // Check if auction has already ended
    if (new Date(auctionWithDeletedStatus.endDate) < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot restore an auction that has already ended',
      });
    }

    // Restore the auction
    await restoreAuctionPrisma(auctionId, auction.version);

    res.status(200).json({
      success: true,
      message: 'Auction has been restored successfully',
      data: { id: auctionId },
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(409).json({
        success: false,
        message: 'This auction was modified by another user. Please refresh and try again.',
      });
    }

    logger.error('Restore auction error:', {
      error: error.message,
      stack: error.stack,
      auctionId,
      userId: req.user?.id,
    });

    res.status(500).json({
      success: false,
      message: 'Error restoring auction',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};
