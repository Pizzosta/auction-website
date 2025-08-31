import mongoose from 'mongoose';

const predefinedCategories = [
  "Electronics",
  "Fashion",
  "Home & Garden",
  "Collectibles",
  "Sports",
  "Automotive",
  "Art",
  "Books",
  "Jewelry",
  "Toys",
];

const auctionSchema = new mongoose.Schema(
  {
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
          required: [true, "Image URL is required"],
          validate: {
            validator: function (v) {
              return /^(https?:\/\/.*\.(?:png|jpg|jpeg))$/.test(v);
            },
            message: (props) => `${props.value} is not a valid image URL!`,
          },
        },
        publicId: {
          type: String,
          required: [true, "Image public ID is required"],
        },
      }
    ],
    category: {
      type: String,
      enum: predefinedCategories,
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'ended', 'sold'],
      default: 'active',
    },
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    winner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
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

// Method to close the auction
auctionSchema.methods.closeAuction = async function (winnerId = null) {
  this.status = winnerId ? 'sold' : 'ended';
  if (winnerId) this.winner = winnerId;
  return this.save();
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
