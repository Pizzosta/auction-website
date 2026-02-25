# Auction Website

This project is an online auction platform built with Node.js, Prisma, and Docker. It allows users to create, bid, and manage auctions in real time.

## Features
- User authentication and profile management
- Create, view, and bid on auctions
- Real-time bidding updates
- Watchlist and featured auctions
- Admin panel for managing users and auctions
- Email notifications
- Rate limiting and security features
- Dockerized deployment

## Project Structure
- `server/` - Backend code, scripts, and Prisma migrations
- `src/` - Main server source code
- `scripts/` - Utility and test scripts
- `docs/` - Documentation guides
- `test/` - Test files

## Setup
1. Clone the repository
2. Install dependencies: `npm install` in the `server` directory
3. Set up environment variables as described in `docs/ADMIN_GUIDE.md`
4. Run database migrations: `npx prisma migrate dev`
5. Start the server: `npm run dev`

## Docker
See `DOCKER_QUICK_START.md` and `DOCKER_SETUP.md` for instructions on running the project with Docker.

## License
See the LICENSE file for details.

## Contributing
Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## Contact
For support or questions, see the documentation or contact the project maintainer.