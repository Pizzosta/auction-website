import Joi from 'joi';

// User query schema validation
export const userQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  sort: Joi.string()
    .pattern(/^(firstname|lastname|email|phone|username|createdAt):(asc|desc)$/)
    .optional(),
  fields: Joi.string().pattern(/^[a-zA-Z0-9_, ]*$/).optional(),
  search: Joi.string().optional(),
  role: Joi.string().valid('user', 'admin').optional(),
});

// Auction query schema validation
export const auctionQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  sort: Joi.string()
    .pattern(/^(title|description|startingPrice|currentPrice|endDate|createdAt|bidCount):(asc|desc)$/)
    .optional(),
  status: Joi.string().valid('active', 'upcoming', 'ended', 'sold').optional(),
  category: Joi.string().optional(),
  search: Joi.string().optional(),
  seller: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional(),
  winner: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional(),
  fields: Joi.string().pattern(/^[a-zA-Z0-9_, ]*$/).optional()
});

// ID schema validation
export const idSchema = Joi.object({
  id: Joi.string().hex().length(24).required().messages({
    'string.hex': 'Invalid user ID format',
    'string.length': 'User ID must be 24 characters long',
    'any.required': 'User ID is required'
  })
});

// Token schema validation
export const tokenSchema = Joi.object({
  token: Joi.string().length(64).hex().required().messages({
    'string.length': 'Invalid token format',
    'string.hex': 'Invalid token format',
    'string.empty': 'Reset token is required',
  }),
});

// Auth schema validation
export const authSchema = {
  register: Joi.object({
    firstname: Joi.string().trim().min(3).max(20).required()
      .messages({
        'string.empty': 'First name is required',
        'string.min': 'First name must be at least 3 characters long',
        'string.max': 'First name cannot be more than 20 characters',
      }),
    middlename: Joi.string().trim().max(20).allow('')
      .messages({
        'string.max': 'Middle name cannot be more than 20 characters',
      }),
    lastname: Joi.string().trim().min(3).max(20).required()
      .messages({
        'string.empty': 'Last name is required',
        'string.min': 'Last name must be at least 3 characters long',
        'string.max': 'Last name cannot be more than 20 characters',
      }),
    phone: Joi.string()
      .pattern(/^[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]*$/, 'phone')
      .message('Please provide a valid phone number')
      .required(),
    username: Joi.string().alphanum().trim().min(3).max(20).required()
      .messages({
        'string.empty': 'Username is required',
        'string.alphanum': 'Username can only contain letters and numbers',
        'string.min': 'Username must be at least 3 characters long',
        'string.max': 'Username cannot be more than 20 characters',
      }),
    email: Joi.string().email().required()
      .messages({
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
        'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
      }),
    role: Joi.string().valid('user', 'admin').default('user'),
    confirmPassword: Joi.string().valid(Joi.ref('password')).required()
      .messages({
        'any.only': 'Passwords do not match',
        'string.empty': 'Please confirm your password',
      }),
  }),

  login: Joi.object({
    email: Joi.string().email().required()
      .messages({
        'string.email': 'Please provide a valid email',
        'string.empty': 'Email is required',
      }),
    password: Joi.string().required()
      .messages({
        'string.empty': 'Password is required',
      }),
  }),

  forgotPassword: Joi.object({
    email: Joi.string().email().required()
      .messages({
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
        'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
      }),
    confirmPassword: Joi.string()
      .valid(Joi.ref('password'))
      .required()
      .messages({
        'any.only': 'Passwords do not match',
        'string.empty': 'Please confirm your password',
      }),
  }),
};

// Auction schema validation
export const auctionSchema = {
  create: Joi.object({
    title: Joi.string().trim().min(3).max(50).required(),
    description: Joi.string().trim().min(3).max(500).required(),
    startingPrice: Joi.number().min(0).required(),
    currentPrice: Joi.number().min(0),
    endDate: Joi.date().iso().greater('now').required(),
    category: Joi.string().required()
    .valid(
      ...[
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
      ]
    )
    .required(),
    images: Joi.array().items(Joi.string().uri()),
  }),

  update: Joi.object({
    title: Joi.string().trim().min(3).max(50).required(),
    description: Joi.string().trim().min(3).max(500).required(),
    startingPrice: Joi.number().min(0).required(),
    currentPrice: Joi.number().min(0),
    endDate: Joi.date().iso().greater('now').required(),
    category: Joi.string().required()
    .valid(
      ...[
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
      ]
    )
    .required(),
    images: Joi.array().items(Joi.string().uri()),
  }).min(1), // At least one field required for update
};

// Bid schema validation
export const bidSchema = {
  amount: Joi.number().min(0.01).required(),
  auctionId: Joi.string().hex().length(24).required().messages({
    'string.hex': 'Invalid auction ID format',
    'string.length': 'Auction ID must be 24 characters long',
    'any.required': 'Auction ID is required'
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
        'any.required': 'User-Agent header is required'
      }),
    'content-type': Joi.string().valid('application/json').required(),
    'x-request-timestamp': Joi.number().integer().required()
  }).options({ allowUnknown: true }), // Allow other headers
  
  validateTimestamp: (timestamp, maxAge = 300) => {
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > maxAge) {
      throw new Error('Webhook timestamp is too old');
    }
    return true;
  }
};

// User schema validation
export const userSchema = {
  deleteUser: Joi.object({
    password: Joi.string().min(8)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\da-zA-Z]).{8,}$/)
      .messages({
        'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
        'string.min': 'Password must be at least 8 characters long',
        'string.empty': 'Password is required to confirm deletion'
      })
      .optional() // Only required if user is deleting themselves
  }),

  updateUser: Joi.object({
    firstname: Joi.string().trim().min(3).max(20)
      .pattern(/^[a-zA-Z\s-']+$/)
      .messages({
        'string.pattern.base': 'First name can only contain letters, spaces, hyphens, and apostrophes',
        'string.min': 'First name must be at least 3 characters long',
        'string.max': 'First name cannot be more than 20 characters',
        'string.empty': 'First name is required'
      }),

    lastname: Joi.string().trim().min(3).max(20)
      .pattern(/^[a-zA-Z\s-']+$/)
      .messages({
        'string.pattern.base': 'Last name can only contain letters, spaces, hyphens, and apostrophes',
        'string.min': 'Last name must be at least 3 characters long',
        'string.max': 'Last name cannot be more than 20 characters',
        'string.empty': 'Last name is required'
      }),

    middlename: Joi.string().trim().allow('').max(20)
      .pattern(/^[a-zA-Z\s-']*$/)
      .messages({
        'string.pattern.base': 'Middle name can only contain letters, spaces, hyphens, and apostrophes',
        'string.max': 'Middle name cannot be more than 20 characters'
      }),

    phone: Joi.string().trim()
      .pattern(/^(?:\+?233|0?)[235]\d{8}$/)
      .messages({
        'string.pattern.base': 'Please enter a valid Ghanaian phone number',
        'string.empty': 'Phone number is required'
      })
      .required(),

    username: Joi.string().trim().min(3).max(20)
      .pattern(/^[a-zA-Z0-9_]+$/)
      .messages({
        'string.pattern.base': 'Username can only contain letters, numbers, and underscores',
        'string.min': 'Username must be at least 3 characters long',
        'string.max': 'Username cannot be more than 20 characters',
        'string.empty': 'Username is required'
      }),

    email: Joi.string().trim().lowercase()
      .email()
      .messages({
        'string.email': 'Please provide a valid email address',
        'string.empty': 'Email is required'
      }),

    password: Joi.string().min(8)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\da-zA-Z]).{8,}$/)
      .messages({
        'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
        'string.min': 'Password must be at least 8 characters long',
        'string.empty': 'Password is required'
      }),

    currentPassword: Joi.string()
      .when('password', {
        is: Joi.exist(),
        then: Joi.required().messages({
          'string.empty': 'Current password is required to update password'
        }),
        otherwise: Joi.optional()
      }),

    confirmPassword: Joi.string()
      .valid(Joi.ref('password'))
      .when('password', {
        is: Joi.exist(),
        then: Joi.required().messages({
          'any.only': 'Passwords do not match',
          'any.required': 'Please confirm your new password'
        }),
        otherwise: Joi.optional()
      }),

    role: Joi.string().valid('user', 'admin')
      .messages({
        'any.only': 'Role must be either user or admin'
      }),

    avatar: Joi.object({
      url: Joi.string().uri(),
      publicId: Joi.string()
    }),

    rating: Joi.number().min(0).max(5).default(0),

    bio: Joi.string().max(500)
      .messages({
        'string.max': 'Bio cannot be more than 500 characters'
      }),

    location: Joi.string().max(100)
      .messages({
        'string.max': 'Location cannot be more than 100 characters'
      }),

    isVerified: Joi.boolean().default(false)
  }).min(1).messages({
    'object.min': 'At least one field must be provided to update'
  }),
  
  // Profile picture validation
  profilePicture: Joi.object({
    profilePicture: Joi.any().required().messages({
      'any.required': 'Profile picture is required',
      'any.empty': 'Profile picture cannot be empty'
    })
  }),
  
  // Delete profile picture validation
  deleteProfilePicture: Joi.object({}).empty().messages({
    'object.base': 'No additional data should be sent with this request'
  })
};
