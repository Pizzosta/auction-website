import express from 'express';
import { placeBid, getBidsByAuction, getMyBids } from '../controllers/bidController.js';
import { protect } from '../middleware/authMiddleware.js';
import { bidSchema, idSchema, bidQuerySchema } from '../utils/validators.js';
import { validate } from '../middleware/validationMiddleware.js';
import { bidLimiter } from '../middleware/security.js';

const router = express.Router();

// Public routes
router.get(
  '/auction/:auctionId',
  validate(idSchema, 'params', { key: 'auctionId' }),
  validate(bidQuerySchema, 'query'),
  getBidsByAuction
);

// Protected routes
router.post(
  '/', 
  protect,
  bidLimiter, 
  validate(bidSchema.create, 'body'), 
  placeBid
);

router.get(
  '/me',
  protect,
  validate(bidQuerySchema, 'query'),
  getMyBids
);

export default router;
