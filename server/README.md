# Auction Website Server

This is the backend server for the auction website. It provides a RESTful API for managing auctions, bids, and users.

## Features

### Auction Management

- Create, read, update, and delete auctions
- Support for auction images with Cloudinary integration
- Automated status transitions (upcoming → active → ended)
- Bid increment validation
- Real-time bid updates via WebSocket

### Bid Management

- Place bids on active auctions
- Bid history tracking
- Soft delete support for data integrity

### User Management

- User registration and authentication
- Profile management
- Role-based access control
- Soft delete support for data integrity

## Data Management

### Soft Delete

The system implements soft delete functionality for Users, Auctions, and Bids. This means that when an item is "deleted", it's not actually removed from the database but rather marked as deleted. This approach provides several benefits:

1. **Data Recovery**: Accidentally deleted items can be restored
2. **Audit Trail**: Track when and by whom items were deleted
3. **Referential Integrity**: Preserve relationships between entities even when deleted
4. **Compliance**: Meet data retention requirements while hiding deleted items from regular queries

#### How it works

Each model (User, Auction, Bid) includes:

- `isDeleted`: Boolean flag indicating if the item is deleted
- `deletedAt`: Timestamp of when the item was deleted
- `deletedBy`: Reference to the user who deleted the item

#### API Support

- Soft delete: DELETE request to the resource endpoint
- Permanent delete: DELETE request with `?permanent=true` (admin only)
- Restore: POST request to `/resource/:id/restore` (admin only)
- View deleted items: Add `?showDeleted=true` to GET requests (admin only)

Example:

```bash
# Soft delete a bid
DELETE /api/bids/123

# Permanently delete a bid (admin only)
DELETE /api/bids/123?permanent=true

# Restore a soft-deleted bid (admin only)
POST /api/bids/123/restore

# View all bids including deleted ones (admin only)
GET /api/bids?showDeleted=true
```

## Getting Started

### Prerequisites

- Node.js 16 or higher
- MongoDB 4.4 or higher
- Redis for session management and job queues

### Installation

1. Clone the repository
2. Install dependencies

   ```bash
   cd server
   npm install
   ```
3. Set up environment variables

   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```
4. Start the server

   ```bash
   # Development
   npm run dev

   # Production
   npm start
   ```

## API Documentation

API documentation is available at `/api-docs` when the server is running. This includes detailed descriptions of all endpoints, request/response formats, and authentication requirements.

## Testing

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- --grep "Auction API"
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -am 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Create a new Pull Request
