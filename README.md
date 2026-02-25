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

### Server (Backend)
- `server/` - Backend code, scripts, and Prisma migrations
	- `src/` - Main server source code
		- `controllers/` - API controllers
		- `routes/` - API routes
		- `services/` - Business logic
		- `middleware/` - Express middleware
		- `repositories/` - Database access logic
		- `utils/` - Utility functions
		- `templates/` - Email and other templates
		- `jobs/` - Scheduled/background jobs
		- `config/` - Configuration files
	- `scripts/` - Utility and test scripts
	- `docs/` - Documentation guides
	- `test/` - Test files
	- `prisma/` - Prisma schema and migrations

### Client (Frontend)
- `client/` - Frontend React app (Vite)
	- `src/` - Main client source code
		- `pages/` - Page components (Home, Login, Register, etc.)
		- `components/` - Reusable UI components (Navbar, Footer, etc.)
		- `layouts/` - Layout components
		- `api/` - API utilities (e.g., axios setup)
		- `assets/` - Static assets (images, icons)
		- `context/` - React context providers (Auth, Theme)
		- `hooks/` - Custom React hooks
		- `utils/` - Utility functions
		- `index.css` - Global styles
		- `main.jsx` - App entry point
		- `App.jsx` - Root component
	- `public/` - Static public files
	- `index.html` - Main HTML file
	- `package.json` - Client dependencies and scripts
	- `vite.config.js` - Vite configuration
	- `tailwind.config.js` - Tailwind CSS configuration
	- `eslint.config.js` - ESLint configuration
	- `postcss.config.js` - PostCSS configuration

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