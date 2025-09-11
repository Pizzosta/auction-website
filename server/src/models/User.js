import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import logger from '../utils/logger.js';

const userSchema = new mongoose.Schema(
  {
    isDeleted: {
      type: Boolean,
      default: false,
      select: false, // Hide from regular queries
    },
    deletedAt: {
      type: Date,
      default: null,
      select: false, // Hide from regular queries
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      select: false, // Hide from regular queries
    },
    firstname: {
      type: String,
      required: [true, 'Please add a first name'],
      trim: true,
      minlength: [3, 'First name must be at least 3 characters long'],
      maxlength: [50, 'First name cannot be more than 50 characters'],
      match: [/^[a-zA-Z\s-']+$/],
    },
    middlename: {
      type: String,
      trim: true,
      maxlength: [50, 'Middle name cannot be more than 50 characters'],
      match: [/^[a-zA-Z\s-']*$/],
    },
    lastname: {
      type: String,
      required: [true, 'Please add a last name'],
      trim: true,
      minlength: [3, 'Last name must be at least 3 characters long'],
      maxlength: [50, 'Last name cannot be more than 50 characters'],
      match: [/^[a-zA-Z\s-']+$/],
    },
    username: {
      type: String,
      required: [true, 'Please add a username'],
      trim: true,
      minlength: [3, 'Username must be at least 3 characters long'],
      maxlength: [30, 'Username cannot be more than 30 characters'],
      match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'],
    },
    phone: {
      type: String,
      required: [true, 'Please add a phone number'],
      trim: true,
      match: [
        /^(?:\+?233|0?)[235]\d{8}$/,
        'Please add a valid Ghanaian phone number starting with 233, +233, 0, or nothing, followed by 2, 3, or 5 and 8 more digits',
      ],
      get: function (value) {
        if (!value) return value;
        try {
          const decipher = crypto.createDecipheriv(
            'aes-256-cbc',
            process.env.DATA_ENCRYPTION_KEY,
            process.env.DATA_ENCRYPTION_IV
          );
          let decrypted = decipher.update(value, 'hex', 'utf8');
          decrypted += decipher.final('utf8');
          return decrypted;
        } catch (e) {
          return value;
        }
      },
      set: function (value) {
        if (!value) return value;
        try {
          const cipher = crypto.createCipheriv(
            'aes-256-cbc',
            process.env.DATA_ENCRYPTION_KEY,
            process.env.DATA_ENCRYPTION_IV
          );
          let encrypted = cipher.update(value, 'utf8', 'hex');
          encrypted += cipher.final('hex');
          return encrypted;
        } catch (e) {
          return value;
        }
      },
    },
    email: {
      type: String,
      required: [true, 'Please add an email'],
      lowercase: true,
      trim: true,
      match: [/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 'Please add a valid email'],
      get: function (value) {
        if (!value) return value;
        try {
          const decipher = crypto.createDecipheriv(
            'aes-256-cbc',
            process.env.DATA_ENCRYPTION_KEY,
            process.env.DATA_ENCRYPTION_IV
          );
          let decrypted = decipher.update(value, 'hex', 'utf8');
          decrypted += decipher.final('utf8');
          return decrypted;
        } catch (e) {
          return value;
        }
      },
      set: function (value) {
        if (!value) return value;
        try {
          const cipher = crypto.createCipheriv(
            'aes-256-cbc',
            process.env.DATA_ENCRYPTION_KEY,
            process.env.DATA_ENCRYPTION_IV
          );
          let encrypted = cipher.update(value, 'utf8', 'hex');
          encrypted += cipher.final('hex');
          return encrypted;
        } catch (e) {
          return value;
        }
      },
    },
    password: {
      type: String,
      required: [true, 'Please add a password'],
      minlength: [8, 'Password must be at least 8 characters long'],
      validate: {
        validator: function (v) {
          return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\da-zA-Z]).{8,}$/.test(v);
        },
        message:
          'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
      },
      select: false, // Don't return password in query results
    },
    profilePicture: {
      url: {
        type: String,
        default: '',
        trim: true,
        validate: {
          validator: function (v) {
            return !v || /^(https?:\/\/.*\.(?:png|jpg|jpeg|webp))$/.test(v);
          },
          message: props => `${props.value} is not a valid image URL!`,
        },
      },
      publicId: {
        type: String,
        default: '',
        trim: true,
      },
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    bio: {
      type: String,
      maxlength: [500, 'Bio cannot be more than 500 characters'],
      default: '',
    },
    location: {
      type: String,
      maxlength: [100, 'Location cannot be more than 100 characters'],
      default: '',
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    resetPasswordToken: String,
    resetPasswordExpire: Date,
    emailVerificationToken: String,
    emailVerificationExpire: Date,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Add text index for search functionality
userSchema.index({
  firstname: 'text',
  lastname: 'text',
  email: 'text',
  phone: 'text',
  username: 'text',
});

// Frequent sort / pagination queries
userSchema.index({ email: 1 });
userSchema.index({ phone: 1 });
userSchema.index({ username: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ role: 1 });
userSchema.index({ isVerified: 1 });
userSchema.index({ rating: 1 });

// Virtual for isAdmin (backward compatibility)
userSchema.virtual('isAdmin').get(function () {
  return this.role === 'admin';
});

// Virtual for full name
userSchema.virtual('fullName').get(function () {
  return [this.firstname, this.middlename, this.lastname].filter(Boolean).join(' ');
});

// Virtual field to get avatar URL with fallback
userSchema.virtual('avatarUrl').get(function () {
  if (this.profilePicture?.url) {
    return this.profilePicture.url;
  }
  const identifier = this.email || this.username;
  return `https://robohash.org/${identifier}?bgset=bg1`;
});

// Virtual for user's auctions
userSchema.virtual('auctions', {
  ref: 'Auction',
  localField: '_id',
  foreignField: 'seller',
  justOne: false,
});

// Virtual for user's bids
userSchema.virtual('bids', {
  ref: 'Bid',
  localField: '_id',
  foreignField: 'bidder',
  justOne: false,
});

// Virtual for user's won auctions
userSchema.virtual('wonAuctions', {
  ref: 'Auction',
  localField: '_id',
  foreignField: 'winner',
  justOne: false,
  match: { status: 'sold' },
});

// Match user entered password to hashed password in database
userSchema.methods.matchPassword = async function (enteredPassword) {
  if (!enteredPassword || !this.password) {
    logger.warn('Missing password input or stored hash', {
      userId: this._id,
      hasEnteredPassword: !!enteredPassword,
      hasStoredHash: !!this.password,
    });
    return false;
  }
  try {
    return await bcrypt.compare(enteredPassword, this.password);
  } catch (error) {
    logger.error('Password comparison failed:', {
      error: error.message,
      stack: error.stack,
      userId: this._id,
    });
    return false;
  }
};

// Generate and hash password reset token
userSchema.methods.getResetPasswordToken = function () {
  // Generate token
  const resetToken = crypto.randomBytes(32).toString('hex');

  // Hash token and set to resetPasswordToken field
  this.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');

  // Set expire (10 minutes)
  this.resetPasswordExpire = Date.now() + 10 * 60 * 1000;

  return resetToken;
};

// Generate email verification token
userSchema.methods.getEmailVerificationToken = function () {
  // Generate token
  const verificationToken = crypto.randomBytes(32).toString('hex');

  // Hash token and set to emailVerificationToken field
  this.emailVerificationToken = crypto.createHash('sha256').update(verificationToken).digest('hex');

  // Set expire (24 hours)
  this.emailVerificationExpire = Date.now() + 24 * 60 * 60 * 1000;

  return verificationToken;
};

// Soft delete method
userSchema.methods.softDelete = async function (deletedBy) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  await this.save();
};

// Restore soft-deleted user
userSchema.methods.restore = async function () {
  this.isDeleted = false;
  this.deletedAt = null;
  this.deletedBy = null;
  await this.save();
};

// Static method for permanent deletion (admin only)
userSchema.statics.permanentDelete = async function (userId) {
  const user = await this.findById(userId).select('+isDeleted');
  if (!user) {
    throw new Error('User not found');
  }

  // Cascade permanent delete
  await mongoose.model('Auction').deleteMany({ seller: userId });
  await mongoose.model('Bid').deleteMany({ bidder: userId });

  await this.deleteOne({ _id: userId });
};

// Add query middleware to exclude soft deleted documents by default
userSchema.pre(/^find/, function (next) {
  // Add includeSoftDeleted flag to queries to include soft deleted documents
  if (!this.getQuery().includeSoftDeleted) {
    this.where({ isDeleted: { $ne: true } });
  }
  delete this.getQuery().includeSoftDeleted;
  next();
});

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);

  // Clear reset tokens when password is changed
  this.resetPasswordToken = undefined;
  this.resetPasswordExpires = undefined;
  next();
});

// Cascade delete user's auctions and bids when user is deleted
userSchema.pre('deleteOne', { document: true, query: false }, async function (next) {
  // This will only work with document.remove()
  await this.model('Auction').deleteMany({ seller: this._id });
  await this.model('Bid').deleteMany({ bidder: this._id });
  next();
});

// For static deleteOne()
userSchema.pre('deleteOne', { document: false, query: true }, async function (next) {
  const docToDelete = await this.model.findOne(this.getFilter());
  if (docToDelete) {
    await mongoose.model('Auction').deleteMany({ seller: docToDelete._id });
    await mongoose.model('Bid').deleteMany({ bidder: docToDelete._id });
  }
  next();
});

const User = mongoose.model('User', userSchema);

export default User;
