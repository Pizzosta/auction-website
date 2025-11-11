export const restoreBid = async (req, res, next) => {
  try {
    const { bidId } = req.params;

    // Only admins can restore bids
    if (req.user.role !== 'admin') {
      throw new AppError('UNAUTHORIZED', 'Only admins can restore deleted bids', 403);
    }

    const bid = await prisma.bid.findUnique({
      where: { id: bidId },
      include: {
        auction: {
          select: {
            id: true,
            status: true,
            endDate: true,
            currentPrice: true,
            highestBidId: true,
          },
        },
      },
    });

    if (!bid) {
      throw new AppError('BID_NOT_FOUND', 'Bid not found', 404);
    }

    if (!bid.isDeleted) {
      throw new AppError('BID_NOT_DELETED', 'Bid is not deleted', 400);
    }

    if (bid.auction.status !== 'active' || bid.auction.endDate < new Date()) {
      throw new AppError('AUCTION_NOT_ACTIVE', 'Cannot restore bid on inactive auction', 400);
    }

    const result = await prisma.$transaction(async (tx) => {
      // Restore the bid
      await tx.bid.update({
        where: { id: bidId },
        data: { isDeleted: false, deletedAt: null, deletedById: null, version: { increment: 1 } },
      });

      // Find the new highest bid
      const newHighestBid = await tx.bid.findFirst({
        where: { auctionId: bid.auctionId, isDeleted: false, isOutbid: false },
        orderBy: [{ amount: 'desc' }, { createdAt: 'asc' }],
        take: 1,
        select: { id: true, amount: true },
      });

      // Update auction if this bid is now the highest
      if (newHighestBid?.id === bidId) {
        await tx.auction.update({
          where: { id: bid.auctionId },
          data: {
            currentPrice: newHighestBid.amount,
            highestBidId: bidId,
            version: { increment: 1 },
          },
        });
      }

      return newHighestBid;
    });

    res.status(200).json({
      success: true,
      message: 'Bid restored successfully',
      ...(result ? { newHighestBid: result.id } : {}),
    });
  } catch (error) {
    logger.error('Restore bid error:', {
      error: error.message,
      bidId: req.params.bidId,
      userId: req.user?.id,
    });

    next(error);
  }
};



const newHighestBid = await tx.bid.findFirst({
              where: {
                auctionId: bid.auctionId,
                isDeleted: false,
                isOutbid: false,
              },
              orderBy: [
                { amount: 'desc' },
                { createdAt: 'asc' }, // For tie-breaking
              ],
              take: 1,
              select: {
                id: true,
                amount: true,
              },
            });

            // Calculate the new current price
            const newCurrentPrice = newHighestBid
              ? newHighestBid.amount
              : currentAuction.startingPrice;
            const newHighestBidId = newHighestBid ? newHighestBid.id : null;

            // Update auction with new price and highest bid
            await tx.auction.update({
              where: {
                id: bid.auctionId,
                version: currentAuction.version, // Ensure no concurrent updates
              },
              data: {
                currentPrice: newCurrentPrice,
                highestBidId: newHighestBidId,
                version: { increment: 1 },
              },
            });

            return { newPrice: newCurrentPrice, newHighestBidId };