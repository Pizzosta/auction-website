import Joi from 'joi';

// Base schema with truly common fields
const baseAuctionSearch = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  sort: Joi.string()
    .valid('currentPrice', 'endDate', 'createdAt', 'bidCount')
    .default('createdAt')
    .optional(),
  order: Joi.string()
    .valid('asc', 'desc')
    .default('desc')
    .optional(),
  category: Joi.string()
    .valid(
      'Electronics', 'Fashion', 'Home & Garden', 'Collectibles',
      'Sports', 'Automotive', 'Art', 'Books', 'Jewelry', 'Toys'
    )
    .optional(),
  search: Joi.string().optional(),
  endingSoon: Joi.boolean()
    .optional()
    .description('Filter for auctions ending in the next 24 hours'),
  fields: Joi.string()
    .pattern(/^[a-zA-Z0-9_,. ]*$/)
    .optional(),
  minPrice: Joi.number().min(0).optional(),
  maxPrice: Joi.number().min(0).optional(),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional(),
});

// Reusable status enums
const userStatus = Joi.string()
  .valid('upcoming', 'active', 'ended', 'sold', 'completed', 'cancelled', 'all')
  .lowercase()
  .optional();

const publicStatus = Joi.string()
  .valid('upcoming', 'active', 'ended', 'sold')
  .lowercase()
  .optional();

// Schema definitions
export const auctionQuerySchema = {
  adminAuctionSearch: baseAuctionSearch.keys({
    status: userStatus,
    seller: Joi.string().uuid({ version: 'uuidv4' }).optional(),
    winner: Joi.string().uuid({ version: 'uuidv4' }).optional(),
    role: Joi.string().valid('user', 'admin').optional(),
  }),

  privateAuctionSearch: baseAuctionSearch.keys({
    status: userStatus,
  }),

  publicAuctionSearch: baseAuctionSearch.keys({
    status: publicStatus,
  }),

  delete: Joi.object({
    permanent: Joi.boolean().default(false).messages({
      'boolean.base': 'permanent must be a boolean',
    }),
  }),
};
