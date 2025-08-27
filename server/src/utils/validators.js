import Joi from 'joi';

// Common validation schemas
const idSchema = Joi.string().pattern(/^[0-9a-fA-F]{24}$/).messages({
  'string.pattern.base': 'Invalid ID format',
});

const paginationSchema = {
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  sort: Joi.string(),
  fields: Joi.string(),
};

// Auth schemas
export const authValidation = {
  register: Joi.object({
    firstname: Joi.string().min(3).max(50).required()
      .messages({
        'string.empty': 'First name is required',
        'string.min': 'First name must be at least 3 characters long',
        'string.max': 'First name cannot be more than 50 characters',
      }),
    middlename: Joi.string().max(50).allow('')
      .messages({
        'string.max': 'Middle name cannot be more than 50 characters',
      }),
    lastname: Joi.string().min(3).max(50).required()
      .messages({
        'string.empty': 'Last name is required',
        'string.min': 'Last name must be at least 3 characters long',
        'string.max': 'Last name cannot be more than 50 characters',
      }),
    phone: Joi.string()
      .pattern(/^[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]*$/, 'phone')
      .message('Please provide a valid phone number')
      .allow(''),
    username: Joi.string().alphanum().min(3).max(30).required()
      .messages({
        'string.empty': 'Username is required',
        'string.alphanum': 'Username can only contain letters and numbers',
        'string.min': 'Username must be at least 3 characters long',
        'string.max': 'Username cannot be more than 30 characters',
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
};

// Auction schemas
export const auctionValidation = {
  create: Joi.object({
    title: Joi.string().required(),
    description: Joi.string().required(),
    startingPrice: Joi.number().min(0).required(),
    currentPrice: Joi.number().min(0),
    endDate: Joi.date().iso().greater('now').required(),
    category: Joi.string().required(),
    images: Joi.array().items(Joi.string().uri()),
  }),

  update: Joi.object({
    title: Joi.string(),
    description: Joi.string(),
    currentPrice: Joi.number().min(0),
    status: Joi.string().valid('active', 'sold', 'cancelled'),
  }).min(1), // At least one field required for update
};

// Bid schemas
export const bidValidation = {
  amount: Joi.number().min(0.01).required(),
  auctionId: idSchema.required(),
};

// User validation
export const userValidation = {
  deleteUser: Joi.object({
    id: Joi.string().hex().length(24).required()
      .messages({
        'string.hex': 'Invalid user ID format',
        'string.length': 'User ID must be 24 characters long',
        'any.required': 'User ID is required'
      }),

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
    id: Joi.string().hex().length(24).required()
      .messages({
        'string.hex': 'Invalid user ID format',
        'string.length': 'User ID must be 24 characters long',
        'any.required': 'User ID is required'
      }),

    firstname: Joi.string().trim().min(3).max(50)
      .pattern(/^[a-zA-Z\s-']+$/)
      .messages({
        'string.pattern.base': 'First name can only contain letters, spaces, hyphens, and apostrophes',
        'string.min': 'First name must be at least 3 characters long',
        'string.max': 'First name cannot be more than 50 characters',
        'string.empty': 'First name is required'
      }),

    lastname: Joi.string().trim().min(3).max(50)
      .pattern(/^[a-zA-Z\s-']+$/)
      .messages({
        'string.pattern.base': 'Last name can only contain letters, spaces, hyphens, and apostrophes',
        'string.min': 'Last name must be at least 3 characters long',
        'string.max': 'Last name cannot be more than 50 characters',
        'string.empty': 'Last name is required'
      }),

    middlename: Joi.string().trim().allow('').max(50)
      .pattern(/^[a-zA-Z\s-']*$/)
      .messages({
        'string.pattern.base': 'Middle name can only contain letters, spaces, hyphens, and apostrophes',
        'string.max': 'Middle name cannot be more than 50 characters'
      }),

    phone: Joi.string().trim()
      .pattern(/^(?:\+?233|0?)[235]\d{8}$/)
      .messages({
        'string.pattern.base': 'Please enter a valid Ghanaian phone number',
        'string.empty': 'Phone number is required'
      }),

    username: Joi.string().trim().min(3).max(30)
      .pattern(/^[a-zA-Z0-9_]+$/)
      .messages({
        'string.pattern.base': 'Username can only contain letters, numbers, and underscores',
        'string.min': 'Username must be at least 3 characters long',
        'string.max': 'Username cannot be more than 30 characters',
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

    confirmPassword: Joi.string().valid(Joi.ref('password'))
      .when('password', {
        is: Joi.exist(),
        then: Joi.required(),
        otherwise: Joi.optional()
      })
      .messages({
        'any.only': 'Passwords do not match',
        'any.required': 'Please confirm your new password'
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
  })
};
