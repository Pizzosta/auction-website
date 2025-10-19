import Joi from 'joi';
import { normalizeToE164 } from './format.js';

// User query schema validation
export const userQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  sort: Joi.string()
    .pattern(/^(firstname|lastname|email|phone|username|createdAt):(asc|desc)$/)
    .default('createdAt:desc')
    .optional(),
  fields: Joi.string()
    .pattern(/^[a-zA-Z0-9_, ]*$/)
    .optional(),
  search: Joi.string().optional(),
  role: Joi.string().valid('user', 'admin').optional(),
  status: Joi.string().valid('active', 'deleted', 'all').default('active').lowercase(),
  lastActiveAfter: Joi.date().iso().optional(),
  lastActiveBefore: Joi.date().iso().optional(),
});

// Auction query schema validation
export const auctionQuerySchema = {
  search: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    sort: Joi.string()
      .pattern(
        /^(title|description|startingPrice|currentPrice|endDate|createdAt|bidCount):(asc|desc)$/
      )
      .default('createdAt:desc')
      .optional(),
    status: Joi.string()
      .valid('upcoming', 'active', 'ended', 'sold', 'cancelled', 'all')
      .lowercase()
      .optional(),
    category: Joi.string().optional(),
    search: Joi.string().optional(),
    endingSoon: Joi.boolean()
      .optional()
      .description('Filter for auctions ending in the next 24 hours'),
    seller: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .optional(),
    winner: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .optional(),
    fields: Joi.string()
      .pattern(/^[a-zA-Z0-9_, ]*$/)
      .optional(),
    minPrice: Joi.number().min(0).optional(),
    maxPrice: Joi.number().min(0).optional(),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional(),
  }),

  delete: Joi.object({
    permanent: Joi.boolean().default(false).messages({
      'boolean.base': 'permanent must be a boolean',
    }),
  }),
}

// Bid query schema validation
export const bidQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sort: Joi.string()
    .pattern(/^(amount|createdAt):(asc|desc)$/)
    .default('createdAt:desc')
    .optional(),
  status: Joi.string()
    .valid('active', 'won', 'lost', 'outbid', 'cancelled', 'all')
    .lowercase()
    .optional(),
  auctionId: Joi.string().uuid({ version: 'uuidv4' }).optional(),
  bidderId: Joi.string().uuid({ version: 'uuidv4' }).optional(),
  minAmount: Joi.number().min(0).optional(),
  maxAmount: Joi.number().min(0).optional(),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional(),
});

// Feedback query schema validation
export const feedbackQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  sort: Joi.string()
    .pattern(/^(rating|createdAt):(asc|desc)$/)
    .default('createdAt:desc')
    .optional(),
  type: Joi.string().valid('seller', 'buyer').optional(),
  auctionId: Joi.string().uuid({ version: 'uuidv4' }).optional(),
  fromUserId: Joi.string().uuid({ version: 'uuidv4' }).optional(),
  toUserId: Joi.string().uuid({ version: 'uuidv4' }).optional(),
  fields: Joi.string()
    .pattern(/^[a-zA-Z0-9_, ]*$/)
    .optional(),
  minRating: Joi.number().min(1).optional(),
  maxRating: Joi.number().min(1).optional(),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional(),
});

// Watchlist query schema validation
export const watchlistQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).max(10000).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  sort: Joi.string()
    .valid('newest', 'oldest')
    .default('newest')
    .optional(),
  status: Joi.string()
    .valid('upcoming', 'active', 'ended', 'sold')
    .lowercase()
    .optional(),
});

// Stats query schema validation
export const statsQuerySchema = Joi.object({
  timeFrame: Joi.string().valid('day', 'week', 'month', 'year', 'all').default('month').optional(),
});

// User stats query schema validation
export const userStatsQuerySchema = Joi.object({
  timeFrame: Joi.string().valid('day', 'week', 'month', 'year', 'all').default('month').optional(),
});

// Auction stats query schema validation
export const auctionStatsQuerySchema = Joi.object({
  timeFrame: Joi.string().valid('day', 'week', 'month', 'year', 'all').default('month').optional(),
});

// Bid stats query schema validation
export const bidStatsQuerySchema = Joi.object({
  timeFrame: Joi.string().valid('day', 'week', 'month', 'year', 'all').default('month').optional(),
});

// ID schema validation (for any ID parameter)
export const idSchema = (key = 'id') => Joi.object({
  [key]: Joi.string().uuid({ version: 'uuidv4' }).required().messages({
    'string.uuid': `${key} must be a valid UUID`,
    'string.length': `${key} must be 36 characters long`,
    'any.required': `${key} is required`,
  }),
});

// Token schema validation
export const tokenSchema = Joi.object({
  token: Joi.string().length(64).hex().required().messages({
    'string.length': 'Token must be 64 characters long',
    'string.hex': 'Invalid token format',
    'string.empty': 'Reset token is required',
  }),
});

// Auth schemas
export const authSchema = {
  verifyEmail: Joi.object({
    email: Joi.string().email().required().lowercase().messages({
      'string.email': 'Please enter a valid email address',
      'any.required': 'Email is required',
    }),
  }),

  register: Joi.object({
    firstname: Joi.string().trim().min(3).max(20).required().messages({
      'string.empty': 'First name is required',
      'string.min': 'First name must be at least 3 characters long',
      'string.max': 'First name cannot be more than 20 characters',
    }),
    middlename: Joi.string().trim().max(20).allow('').messages({
      'string.max': 'Middle name cannot be more than 20 characters',
    }),
    lastname: Joi.string().trim().min(3).max(20).required().messages({
      'string.empty': 'Last name is required',
      'string.min': 'Last name must be at least 3 characters long',
      'string.max': 'Last name cannot be more than 20 characters',
    }),
    phone: Joi.string()
      .custom((value, helpers) => {
        const normalized = normalizeToE164(value);
        if (!normalized) {
          return helpers.error('any.invalid');
        }
        return normalized;
      }, 'E.164 normalization')
      .message({
        'string.phone': 'Please enter a valid Ghanaian phone number',
        'string.empty': 'Phone is required',
      })
      .required(),
    username: Joi.string()
      .trim()
      .min(3)
      .max(20)
      .pattern(/^[a-zA-Z0-9_]+$/)
      .messages({
        'string.pattern.base':
          'Username should be one word (can only contain letters, numbers, and underscores)',
        'string.min': 'Username must be at least 3 characters long',
        'string.max': 'Username cannot be more than 20 characters',
        'string.empty': 'Username is required',
      }),

    email: Joi.string().email().required().messages({
      'string.email': 'Please provide a valid email',
      'string.empty': 'Email is required',
    }),
    password: Joi.string()
      .min(8)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\da-zA-Z]).+$/)
      .required()
      .messages({
        'string.empty': 'Password is required',
        'string.min': 'Password must be at least 8 characters long',
        'string.pattern.base':
          'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
      }),
    role: Joi.string().valid('user', 'admin').default('user'),
    confirmPassword: Joi.string().valid(Joi.ref('password')).required().messages({
      'any.only': 'Passwords do not match',
      'string.empty': 'Please confirm your password',
    }),
  }),

  login: Joi.object({
    email: Joi.string().email().required().messages({
      'string.email': 'Please provide a valid email',
      'string.empty': 'Email is required',
    }),
    password: Joi.string().required().messages({
      'string.empty': 'Password is required',
    }),
  }),

  forgotPassword: Joi.object({
    email: Joi.string().email().required().messages({
      'string.email': 'Please provide a valid email',
      'string.empty': 'Email is required',
    }),
  }),

  resetPassword: Joi.object({
    password: Joi.string()
      .min(8)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\da-zA-Z]).{8,}$/)
      .required()
      .messages({
        'string.empty': 'Password is required',
        'string.min': 'Password must be at least 8 characters long',
        'string.pattern.base':
          'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
      }),
    confirmPassword: Joi.string().valid(Joi.ref('password')).required().messages({
      'any.only': 'Passwords do not match',
      'string.empty': 'Please confirm your password',
    }),
  }),
};

// User delete query schema (for ?permanent=true)
export const userDeleteQuerySchema = Joi.object({
  permanent: Joi.boolean().default(false).messages({
    'boolean.base': 'permanent must be a boolean',
  }),
});

// Auction schema validation
export const auctionSchema = {
  create: Joi.object({
    title: Joi.string().trim().min(3).max(50).required(),
    description: Joi.string().trim().min(3).max(500).required(),
    startingPrice: Joi.number().min(0).required(),
    bidIncrement: Joi.number().min(0.01).required(),
    startDate: Joi.date().iso().greater('now').required(),
    endDate: Joi.date().iso().greater(Joi.ref('startDate')).required(),
    category: Joi.string()
      .required()
      .valid(
        ...[
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
        ]
      )
      .required(),
    images: Joi.array()
      .items(
        Joi.object({
          url: Joi.string().uri().required(),
          publicId: Joi.string().required(),
        })
      )
      .min(1)
      .required()
      .messages({
        'array.min': 'At least one image is required',
        'array.base': 'Images must be an array',
        'any.required': 'Images are required',
      }),
  }),

  update: Joi.object({
    title: Joi.string().trim().min(3).max(50).optional(),
    description: Joi.string().trim().min(3).max(500).optional(),
    startingPrice: Joi.number().min(0).optional(),
    bidIncrement: Joi.number().min(0.01).optional(),
    startDate: Joi.date().iso().greater('now').optional(),
    endDate: Joi.date().iso().greater(Joi.ref('startDate')).optional(),
    category: Joi.string()
      .optional()
      .valid(
        ...[
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
        ]
      ),
    images: Joi.array()
      .items(
        Joi.object({
          url: Joi.string().uri().required(),
          publicId: Joi.string().required(),
        })
      )
      .min(1)
      .optional()
      .messages({
        'array.min': 'At least one image is required',
        'array.base': 'Images must be an array',
        'any.required': 'Images are required',
      }),
  }).min(1), // At least one field required for update
};

// Bid schema validation
export const bidSchema = {
  create: Joi.object({
    amount: Joi.number().min(0.01).required(),
    auctionId: Joi.string().uuid({ version: 'uuidv4' }).required().messages({
      'string.uuid': 'Invalid UUID format',
      'string.length': 'Auction ID must be 36 characters long',
      'any.required': 'Auction ID is required',
    }),
  }),
  delete: Joi.object({
    permanent: Joi.boolean().default(false).messages({
      'boolean.base': 'permanent must be a boolean',
    }),
  }).messages({
    'object.unknown': 'Unknown parameters provided',
  }),
};

// Webhook schema validation
export const webhookSchema = {
  headers: Joi.object({
    'x-webhook-event': Joi.string().required(),
    'x-webhook-signature': Joi.string().required(),
    'x-webhook-delivery': Joi.string().guid().required(),
    'user-agent': Joi.string()
      .pattern(/^KawodzeAuction\/\d+\.\d+(?:\.\d+)?(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?$/)
      .required()
      .messages({
        'string.pattern.base': 'User-Agent must be in format: AuctionWebhookService/x.y.z',
        'any.required': 'User-Agent header is required',
      }),
    'content-type': Joi.string().valid('application/json').required(),
    'x-request-timestamp': Joi.number().integer().required(),
  }).options({ allowUnknown: true }), // Allow other headers

  validateTimestamp: (timestamp, maxAge = 300) => {
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > maxAge) {
      throw new Error('Webhook timestamp is too old');
    }
    return true;
  },
};

// User schema validation
export const userSchema = {
  deleteUser: Joi.object({
    password: Joi.string()
      .min(8)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\da-zA-Z]).{8,}$/)
      .messages({
        'string.pattern.base':
          'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
        'string.min': 'Password must be at least 8 characters long',
        'string.empty': 'Password is required to confirm deletion',
      })
      .optional(), // Only required if user is deleting themselves
  }),

  updateUser: Joi.object({
    firstname: Joi.string()
      .trim()
      .min(3)
      .max(20)
      .pattern(/^[a-zA-Z\s-']+$/)
      .messages({
        'string.pattern.base':
          'First name can only contain letters, spaces, hyphens, and apostrophes',
        'string.min': 'First name must be at least 3 characters long',
        'string.max': 'First name cannot be more than 20 characters',
        'string.empty': 'First name is required',
      }),

    lastname: Joi.string()
      .trim()
      .min(3)
      .max(20)
      .pattern(/^[a-zA-Z\s-']+$/)
      .messages({
        'string.pattern.base':
          'Last name can only contain letters, spaces, hyphens, and apostrophes',
        'string.min': 'Last name must be at least 3 characters long',
        'string.max': 'Last name cannot be more than 20 characters',
        'string.empty': 'Last name is required',
      }),

    middlename: Joi.string()
      .trim()
      .allow('')
      .max(20)
      .pattern(/^[a-zA-Z\s-']*$/)
      .messages({
        'string.pattern.base':
          'Middle name can only contain letters, spaces, hyphens, and apostrophes',
        'string.max': 'Middle name cannot be more than 20 characters',
      }),

    phone: Joi.string()
      .custom((value, helpers) => {
        const normalized = normalizeToE164(value);
        if (!normalized) {
          return helpers.error('any.invalid');
        }
        return normalized;
      }, 'E.164 normalization')
      .message({
        'string.phone': 'Please enter a valid Ghanaian phone number',
        'string.empty': 'Phone is required',
      }),

    username: Joi.string()
      .trim()
      .min(3)
      .max(20)
      .pattern(/^[a-zA-Z0-9_]+$/)
      .messages({
        'string.pattern.base':
          'Username should be one word (can only contain letters, numbers, and underscores)',
        'string.min': 'Username must be at least 3 characters long',
        'string.max': 'Username cannot be more than 20 characters',
        'string.empty': 'Username is required',
      }),

    email: Joi.string().trim().lowercase().email().messages({
      'string.email': 'Please provide a valid email address',
      'string.empty': 'Email is required',
    }),

    password: Joi.string()
      .min(8)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\da-zA-Z]).{8,}$/)
      .messages({
        'string.pattern.base':
          'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
        'string.min': 'Password must be at least 8 characters long',
        'string.empty': 'Password is required',
      }),

    currentPassword: Joi.string().when('password', {
      is: Joi.exist(),
      then: Joi.required().messages({
        'string.empty': 'Current password is required to update password',
      }),
      otherwise: Joi.optional(),
    }),

    confirmPassword: Joi.string()
      .valid(Joi.ref('password'))
      .when('password', {
        is: Joi.exist(),
        then: Joi.required().messages({
          'any.only': 'Passwords do not match',
          'any.required': 'Please confirm your new password',
        }),
        otherwise: Joi.optional(),
      }),

    role: Joi.string().valid('user', 'admin').messages({
      'any.only': 'Role must be either user or admin',
    }),

    avatar: Joi.object({
      url: Joi.string().uri(),
      publicId: Joi.string(),
    }),

    rating: Joi.number().min(0).max(5).default(0),

    bio: Joi.string().max(500).messages({
      'string.max': 'Bio cannot be more than 500 characters',
    }),

    location: Joi.string().max(100).messages({
      'string.max': 'Location cannot be more than 100 characters',
    }),

    isVerified: Joi.boolean().default(false),
  })
    .min(1)
    .messages({
      'object.min': 'At least one field must be provided to update',
    }),

  // Profile picture validation
  profilePicture: Joi.object({
    url: Joi.string().uri().required().messages({
      'string.uri': 'Profile picture must be a valid URL',
      'string.empty': 'Profile picture URL cannot be empty',
      'any.required': 'Profile picture URL is required',
    }),
    publicId: Joi.string()
      .required()
      .pattern(/^[a-zA-Z0-9_\-\/]+$/)
      .messages({
        'string.pattern.base': 'Invalid public ID format',
        'string.empty': 'Public ID cannot be empty',
        'any.required': 'Public ID is required',
      }),
  }).messages({
    'object.base': 'Profile picture must be an object with url and publicId',
  }),

  // Delete profile picture validation
  deleteProfilePicture: Joi.object({}).empty().messages({
    'object.base': 'No additional data should be sent with this request',
  }),
};

// Watchlist schema validation
export const watchlistSchema = {
  add: Joi.object({
    auctionId: Joi.string().uuid({ version: 'uuidv4' }).required().messages({
      'string.uuid': 'Invalid Auction ID format',
      'any.required': 'Auction ID is required',
    }),
  }),
  remove: Joi.object({
    auctionId: Joi.string().uuid({ version: 'uuidv4' }).required().messages({
      'string.uuid': 'Invalid Auction ID format',
      'any.required': 'Auction ID is required',
    }),
  }),
  toggle: Joi.object({
    auctionId: Joi.string().uuid({ version: 'uuidv4' }).required().messages({
      'string.uuid': 'Invalid Auction ID format',
      'any.required': 'Auction ID is required',
    }),
  }),
};

// Featured auction delete query schema (for ?permanent=true)
export const featuredAuctionDeleteQuerySchema = Joi.object({
  permanent: Joi.boolean().default(false).messages({
    'boolean.base': 'permanent must be a boolean',
  }),
});

// FeaturedAuction schema validation
export const featuredAuctionSchema = {
  add: Joi.object({
    auctionId: Joi.string().uuid({ version: 'uuidv4' }).required().messages({
      'string.uuid': 'Invalid Auction ID format',
      'any.required': 'Auction ID is required',
    }),
  }),
  remove: Joi.object({
    auctionId: Joi.string().uuid({ version: 'uuidv4' }).required().messages({
      'string.uuid': 'Invalid Auction ID format',
      'any.required': 'Auction ID is required',
    }),
  }),
  restore: Joi.object({
    auctionId: Joi.string().uuid({ version: 'uuidv4' }).required().messages({
      'string.uuid': 'Invalid Auction ID format',
      'any.required': 'Auction ID is required',
    }),
  }),
};

// Feedback schema validation
export const feedbackSchema = {
  create: Joi.object({
    auctionId: Joi.string().uuid({ version: 'uuidv4' }).required().messages({
      'string.uuid': 'Invalid Auction ID format',
      'any.required': 'Auction ID is required',
    }),
    rating: Joi.number().min(1).max(5).required().messages({
      'number.min': 'Rating must be at least 1',
      'number.max': 'Rating cannot exceed 5',
      'any.required': 'Rating is required',
    }),
    comment: Joi.string().trim().min(3).max(500).required().messages({
      'string.empty': 'Comment is required',
      'string.min': 'Comment must be at least 3 characters long',
      'string.max': 'Comment cannot exceed 500 characters',
    }),
    type: Joi.string().valid('seller', 'buyer').required().messages({
      'any.only': 'Type must be either seller or buyer',
    }),
    isAnonymous: Joi.boolean().default(false),
  }),

  respond: Joi.object({
    response: Joi.string().trim().min(3).max(500).required().messages({
      'string.empty': 'Response is required',
      'string.min': 'Response must be at least 3 characters long',
      'string.max': 'Response cannot exceed 500 characters',
    }),
  }),
};
