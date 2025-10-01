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

- User registration and authenticatio| col1 | col2 | col3 |
  | ---- | ---- | ---- |
  |      |      |      |
  |      |      |      |

  n
- Profile management
- Role-based access control
- Soft delete support for data integrity

## Data Management

### Soft Delete

The system implements soft delete functionality for Users, Auctions, and Bids. This means that when an item is "deleted", it's not actually removed from the database but rather marked as deleted. This approach provides several benefits:

## Getting Started

### Prerequisites

- Node.js 18 or higher
- PostgreSQL 15 or higher
- Redis 6 or higher
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/auction-website.git
   cd auction-website/server
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   yarn
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   Update the `.env` file with your configuration.

4. **Database setup**
   ```bash
   # Run database migrations
   npx prisma migrate dev
   
   # Seed initial data (optional)
   npx prisma db seed
   ```

5. **Start the development server**
   ```bash
   # Development
   npm run dev
   
   # Production build
   npm run build
   npm start
   ```

The API will be available at `http://localhost:5000` by default.

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `PORT` | Server port | No | 5000 |
| `NODE_ENV` | Environment (development/production) | Yes | development |
| `DATABASE_URL` | PostgreSQL connection URL | Yes | - |
| `REDIS_URL` | Redis connection URL | Yes | - |
| `JWT_SECRET` | Secret for JWT signing | Yes | - |
| `JWT_EXPIRES_IN` | JWT expiration time | No | 1d |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name | Yes | - |
| `CLOUDINARY_API_KEY` | Cloudinary API key | Yes | - |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret | Yes | - |
| `SMTP_HOST` | SMTP server host | Yes | - |
| `SMTP_PORT` | SMTP server port | Yes | - |
| `SMTP_USER` | SMTP username | Yes | - |
| `SMTP_PASS` | SMTP password | Yes | - |
| `CLIENT_URL` | Frontend URL | Yes | http://localhost:3000 |

## API Documentation

Interactive API documentation is available at `/api-docs` when running in development mode. The documentation includes:

- Detailed endpoint descriptions
- Request/response schemas
- Authentication requirements
- Example requests
- Error responses

### Authentication

All protected endpoints require a valid JWT token in the `Authorization` header:

```
Authorization: Bearer <token>
```

### Rate Limiting

- Public endpoints: 100 requests per 15 minutes
- Authenticated endpoints: 1000 requests per 15 minutes
- Admin endpoints: 2000 requests per 15 minutes

### Error Responses

Standard error response format:

```json
{
  "status": "error",
  "message": "Error message",
  "code": "ERROR_CODE",
  "details": {}
}
```

## Development

### Project Structure

```
src/
├── config/         # Configuration files
├── controllers/    # Route controllers
├── middleware/     # Express middleware
├── models/         # Database models
├── routes/         # Route definitions
├── services/       # Business logic
├── utils/          # Utility functions
├── validations/    # Request validations
└── server.js       # Application entry point
```

### Scripts

- `npm run dev`: Start development server with hot-reload
- `npm run build`: Build for production
- `npm start`: Start production server
- `npm test`: Run tests
- `npm run lint`: Run ESLint
- `npm run format`: Format code with Prettier
- `prisma studio`: Open Prisma Studio for database management

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run specific test file
npm test -- src/tests/auth.test.js

# Generate coverage report
npm run test:coverage
```

## Deployment

### Docker

```bash
# Build the image
docker build -t auction-api .

# Run the container
docker run -p 5000:5000 --env-file .env auction-api
```

### PM2 (Production)

```bash
# Install PM2 globally
npm install -g pm2

# Start application
pm2 start dist/server.js --name "auction-api"

# Save process list
pm2 save

# Generate startup script
pm2 startup
```

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Commit Message Guidelines

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` A new feature
- `fix:` A bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting, etc.)
- `refactor:` Code change that neither fixes a bug nor adds a feature
- `perf:` Performance improvement
- `test:` Adding or modifying tests
- `chore:` Changes to the build process or auxiliary tools

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
