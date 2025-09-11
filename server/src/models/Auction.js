import mongoose from 'mongoose';

const predefinedCategories = [
  'Electronics',
  'Fashion',
  'Home & Garden',
  'Collectibles',
  'Sports',
  'Automotive',
  'Art',
  'Books',
  'Jewelry',
  'Toys',
];

const auctionStatusEnum = ['upcoming', 'active', 'ended', 'sold'];

const auctionSchema = new mongoose.Schema(
  {
    isDeleted: {
      type: Boolean,
      default: false,
      select: false, // Hide from regular queries
    },
    deletedAt: {
      type: Date,
      default: null,
      select: false,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      select: false,
    },
    title: {
      type: String,
      required: [true, 'Please add a title'],
      trim: true,
      minlength: [3, 'Title must be at least 3 characters long'],
      maxlength: [50, 'Title cannot be more than 50 characters'],
    },
    description: {
      type: String,
      required: [true, 'Please add a description'],
      trim: true,
      minlength: [3, 'Description must be at least 3 characters long'],
      maxlength: [500, 'Description cannot be more than 500 characters'],
    },
    startingPrice: {
      type: Number,
      required: [true, 'Please add a starting price'],
      min: [0, 'Starting price must be a positive number'],
    },
    currentPrice: {
      type: Number,
      default() {
        return this.startingPrice;
      },
    },
    startDate: {
      type: Date,
      required: [true, 'Please add a start date'],
      validate: {
        validator(value) {
          // Start date must be in the future
          return value > Date.now();
        },
        message: 'Start date must be in the future',
      },
    },
    endDate: {
      type: Date,
      required: [true, 'Please add an end date'],
      validate: {
        validator(value) {
          // End date must be in the future
          return value > Date.now();
        },
        message: 'End date must be in the future',
      },
    },
    images: [
      {
        url: {
          type: String,
          required: [true, 'Image URL is required'],
          validate: {
            validator: function (v) {
              return /^(https?:\/\/.*\.(?:png|jpg|jpeg|webp))$/.test(v);
            },
            message: props => `${props.value} is not a valid image URL!`,
          },
        },
        publicId: {
          type: String,
          required: [true, 'Image public ID is required'],
        },
      },
    ],
    category: {
      type: String,
      enum: predefinedCategories,
      required: true,
    },
    status: {
      type: String,
      enum: auctionStatusEnum,
      default: 'upcoming',
      required: true,
    },
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    winner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      description: 'The user who won the auction (if any)',
    },
    bidIncrement: {
      type: Number,
      required: true,
      min: [0.01, 'Bid increment must be at least 0.01'],
      default: 1,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Add text index for search functionality
auctionSchema.index({ title: 'text', description: 'text', category: 'text' });

// Frequent sort / pagination queries
auctionSchema.index({ createdAt: -1 });
auctionSchema.index({ status: 1 });

// Virtual for time remaining (in seconds)
auctionSchema.virtual('timeRemaining').get(function () {
  return Math.max(0, Math.ceil((this.endDate - Date.now()) / 1000));
});

// Check if auction has ended
auctionSchema.virtual('hasEnded').get(function () {
  return this.endDate < new Date() || this.status === 'ended' || this.status === 'sold';
});

// Virtual for bid count
auctionSchema.virtual('bidCount', {
  ref: 'Bid',
  localField: '_id',
  foreignField: 'auction',
  count: true,
});

// Virtual for highest bid
auctionSchema.virtual('highestBid', {
  ref: 'Bid',
  localField: '_id',
  foreignField: 'auction',
  justOne: true,
  options: { sort: { amount: -1 } },
});

// Virtual for highest bidder
auctionSchema.virtual('highestBidder', {
  ref: 'Bid',
  localField: '_id',
  foreignField: 'auction',
  justOne: true,
  options: {
    sort: { amount: -1 },
    populate: { path: 'bidder', select: 'username email avatarUrl' },
  },
});

// Method to close the auction
auctionSchema.methods.closeAuction = async function (winnerId = null) {
  this.status = winnerId ? 'sold' : 'ended';
  if (winnerId) this.winner = winnerId;
  return this.save();
};

// Add query middleware to exclude soft deleted documents by default
auctionSchema.pre(/^find/, function (next) {
  // Add includeSoftDeleted flag to queries to include soft deleted documents
  if (!this.getQuery().includeSoftDeleted) {
    this.where({ isDeleted: { $ne: true } });
  }
  delete this.getQuery().includeSoftDeleted;
  next();
});

// Soft delete method
auctionSchema.methods.softDelete = async function (deletedBy) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  await this.save();
};

// Restore soft-deleted auction
auctionSchema.methods.restore = async function () {
  this.isDeleted = false;
  this.deletedAt = null;
  this.deletedBy = null;
  await this.save();
};

// Static method for permanent deletion (admin only)
auctionSchema.statics.permanentDelete = async function (auctionId) {
  const auction = await this.findById(auctionId).select('+isDeleted');
  if (!auction) {
    throw new Error('Auction not found');
  }

  // Delete associated bids
  await mongoose.model('Bid').deleteMany({ auction: auctionId });

  // Delete the auction
  await this.deleteOne({ _id: auctionId });
};

// Update auction status based on end date
auctionSchema.pre('save', function (next) {
  if (this.isModified('endDate') && this.endDate < new Date()) {
    this.status = 'ended';
  }
  next();
});

// Cascade delete bids when auction is deleted
auctionSchema.pre('remove', async function (next) {
  await this.model('Bid').deleteMany({ auction: this._id });
  next();
});

const Auction = mongoose.model('Auction', auctionSchema);

export default Auction;
