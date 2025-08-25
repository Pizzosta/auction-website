import mongoose from 'mongoose';

const bidSchema = new mongoose.Schema(
  {
    amount: {
      type: Number,
      required: [true, 'Please add a bid amount'],
      min: [0, 'Bid amount must be a positive number'],
      set: val => Math.round(val * 100) / 100, // Round to 2 decimal places
    },
    auction: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, 'Auction ID is required'],
      ref: 'Auction',
    },
    bidder: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, 'Bidder ID is required'],
      ref: 'User',
    },
    isWinningBid: {
      type: Boolean,
      default: false,
    },
    outbid: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Ensure each user can only have one active bid per auction
bidSchema.index({ auction: 1, bidder: 1 }, { unique: true });

// Add a compound index for faster querying of bids by auction and amount
bidSchema.index({ auction: 1, amount: -1 });

// Virtual for formatted amount
bidSchema.virtual('formattedAmount').get(function () {
  return `$${this.amount.toFixed(2)}`;
});

// Update auction's current price when a new bid is placed
bidSchema.pre('save', async function (next) {
  if (this.isNew) {
    const Auction = mongoose.model('Auction');
    const auction = await Auction.findById(this.auction);

    if (!auction) {
      throw new Error('Auction not found');
    }

    // Check if auction has ended
    if (auction.status !== 'active') {
      throw new Error('This auction is no longer active');
    }

    // Check if bid amount is higher than current price
    if (this.amount <= auction.currentPrice) {
      throw new Error(`Bid amount must be higher than $${auction.currentPrice.toFixed(2)}`);
    }

    // Update previous highest bid to be marked as outbid
    await this.model('Bid').updateOne(
      {
        auction: this.auction,
        isWinningBid: true,
      },
      {
        $set: {
          outbid: true,
          isWinningBid: false,
        },
      },
    );

    // Update auction's current price
    auction.currentPrice = this.amount;
    await auction.save();

    // Mark this bid as the current winning bid
    this.isWinningBid = true;

    // Emit socket event for real-time updates
    const { io } = this.model('Auction'); // Get io instance from Auction model
    if (io) {
      io.to(this.auction.toString()).emit('newBid', {
        auctionId: this.auction,
        amount: this.amount,
        bidder: this.bidder,
        createdAt: this.createdAt,
      });
    }
  }
  next();
});

// After saving, check if this is the first bid and extend auction end time if needed
bidSchema.post('save', async function () {
  const Bid = this.model('Bid');
  const auctionBids = await Bid.countDocuments({ auction: this.auction });

  if (auctionBids === 1) {
    // This is the first bid
    const Auction = mongoose.model('Auction');
    const auction = await Auction.findById(this.auction);

    // Extend auction end time by 10 minutes if it's about to end soon (less than 10 minutes left)
    const tenMinutesFromNow = new Date(Date.now() + 10 * 60 * 1000);
    if (auction.endDate < tenMinutesFromNow) {
      auction.endDate = tenMinutesFromNow;
      await auction.save();

      // Emit socket event for auction time extension
      const { io } = this.model('Auction');
      if (io) {
        io.to(auction._id.toString()).emit('auctionExtended', {
          auctionId: auction._id,
          newEndDate: tenMinutesFromNow,
        });
      }
    }
  }
});

const Bid = mongoose.model('Bid', bidSchema);

export default Bid;
