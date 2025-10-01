# Auction Website - API Reference

This document provides detailed information about the Auction Website API, including available endpoints, request/response formats, and examples.

## Base URL

```
https://api.auction-website.com/api
```

## Authentication

Most endpoints require authentication using a JWT token. Include the token in the `Authorization` header:

```
Authorization: Bearer your-jwt-token
```

## Response Format

All API responses follow this format:

```json
{
  "status": "success",
  "data": {
    // Response data
  },
  "meta": {
    // Pagination info (if applicable)
  }
}
```

Error responses:

```json
{
  "status": "error",
  "message": "Error description",
  "code": "ERROR_CODE",
  "errors": {
    // Validation errors (if applicable)
  }
}
```

## Rate Limiting

- **Rate Limit**: 100 requests per 15 minutes per IP address
- **Authentication Required**: 1000 requests per 15 minutes per user
- **Headers**:
  - `X-RateLimit-Limit`: Maximum requests allowed
  - `X-RateLimit-Remaining`: Remaining requests
  - `X-RateLimit-Reset`: Time when limit resets (UTC timestamp)

## Endpoints

### Authentication

#### Register a New User

```http
POST /auth/register
```

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "username": "exampleuser",
  "firstname": "John",
  "lastname": "Doe"
}
```

**Responses:**

- `201 Created`: User registered successfully
- `400 Bad Request`: Invalid input data
- `409 Conflict`: Email or username already exists

---

#### Login

```http
POST /auth/login
```

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response:**

```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "email": "user@example.com",
      "username": "exampleuser",
      "role": "user"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### Users

#### Get Current User

```http
GET /users/me
```

**Headers:**
- `Authorization: Bearer <token>`

**Response:**

```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "email": "user@example.com",
      "username": "exampleuser",
      "firstname": "John",
      "lastname": "Doe",
      "role": "user",
      "isVerified": true,
      "createdAt": "2023-01-01T00:00:00.000Z",
      "updatedAt": "2023-01-01T00:00:00.000Z"
    }
  }
}
```

### Auctions

#### Get All Auctions

```http
GET /auctions
```

**Query Parameters:**
- `status` - Filter by status (active, upcoming, ended)
- `category` - Filter by category ID
- `minPrice` - Minimum price
- `maxPrice` - Maximum price
- `sort` - Sort field (createdAt, endingSoon, price)
- `order` - Sort order (asc, desc)
- `limit` - Items per page (default: 10)
- `page` - Page number (default: 1)

**Response:**

```json
{
  "status": "success",
  "data": {
    "auctions": [
      {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "title": "Vintage Camera",
        "description": "Vintage camera in excellent condition",
        "startingPrice": 100,
        "currentPrice": 150,
        "endDate": "2023-12-31T23:59:59.000Z",
        "status": "active",
        "images": ["url1", "url2"],
        "seller": {
          "id": "123e4567-e89b-12d3-a456-426614174000",
          "username": "seller1"
        }
      }
    ]
  },
  "meta": {
    "total": 1,
    "page": 1,
    "limit": 10,
    "totalPages": 1
  }
}
```

### Bids

#### Place a Bid

```http
POST /bids
```

**Headers:**
- `Authorization: Bearer <token>`

**Request Body:**

```json
{
  "auctionId": "123e4567-e89b-12d3-a456-426614174000",
  "amount": 200
}
```

**Responses:**

- `201 Created`: Bid placed successfully
- `400 Bad Request`: Invalid bid amount
- `401 Unauthorized`: Not authenticated
- `403 Forbidden`: Bidding on own auction
- `404 Not Found`: Auction not found
- `409 Conflict`: Higher bid exists

## Webhooks

### Available Webhooks

#### Auction Ended

```
POST /webhooks/auction-ended
```

**Payload:**

```json
{
  "event": "auction.ended",
  "data": {
    "auctionId": "123e4567-e89b-12d3-a456-426614174000",
    "winnerId": "123e4567-e89b-12d3-a456-426614174000",
    "finalPrice": 250,
    "endedAt": "2023-01-01T00:00:00.000Z"
  },
  "timestamp": "2023-01-01T00:00:00.000Z"
}
```

## Error Codes

| Code | Description |
|------|-------------|
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 409 | Conflict |
| 422 | Validation Error |
| 429 | Too Many Requests |
| 500 | Internal Server Error |
| 503 | Service Unavailable |

## Changelog

### v1.0.0 (2023-09-30)
- Initial API release

## Support

For API support, please contact api-support@auction-website.com.
