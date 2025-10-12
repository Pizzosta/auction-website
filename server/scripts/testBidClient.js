// Save as testBidClient.js
import { io } from 'socket.io-client';

// Replace with your server URL and port
const SERVER_URL = 'http://localhost:5001';

// If you need authentication, provide your JWT token here
const TOKEN =
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2M2E5NjQxNS04NWFiLTQ4NWItYmNmZC05OGM5MWI1NGRlMjkiLCJlbWFpbCI6InBhc3N3b3JkMTFAbWFpbC5jb20iLCJyb2xlIjoidXNlciIsInR5cGUiOiJhY2Nlc3MiLCJpYXQiOjE3NjAyNzgyMzUsImV4cCI6MTc2MDI3OTEzNX0.UjfEWL0YEBpSZbrOk5Hh0Fz5OoBN8VlSHbKzGuhNsEk"
const socket = io(SERVER_URL, {
  auth: { token: TOKEN },
  transports: ['websocket'],
});

// Listen for connection
socket.on('connect', () => {
  console.log('Connected as socket id:', socket.id);

  // Listen for personal room join confirmation (custom event)
  socket.on(`user:${socket.id}`, () => {
    console.log(`User ${socket.id} joined personal room`);
  });

  // Listen for viewerCount updates globally
  socket.on('viewerCount', data => {
    console.log('viewerCount:', data);
  });

  // Join an auction room
  const auctionId = '7a33f217-6483-4e98-a755-8e5e6cf7f2bc';
  socket.emit('joinAuction', auctionId, response => {
    console.log('Join auction response:', response);
    console.log(`User ${socket.id} joined auction ${auctionId}`);

    // Place a bid after joining
    socket.emit('placeBid', { auctionId, amount: 42 }, bidResponse => {
      console.log('placeBid response:', bidResponse);
    });

    // Leave auction after bid (for demonstration)
    setTimeout(() => {
      socket.emit('leaveAuction', auctionId);
      console.log(`leaveAuction emitted for auction ${auctionId}`);
    }, 2000);
  });
});

// Listen for new bids in the auction room
socket.on('newBid', data => {
  console.log('New bid received:', data);
});

socket.on('bid:outbid', data => {
  console.log('You have been outbid:', data);
});

// Handle errors
socket.on('connect_error', err => {
  console.error('Connection error:', err.message);
});
