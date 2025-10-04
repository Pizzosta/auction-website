// Save as testBidClient.js
import { io } from 'socket.io-client';

// Replace with your server URL and port
const SERVER_URL = 'http://localhost:5001';

// If you need authentication, provide your JWT token here
const TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJjNDcyMmFjYi02ODRiLTQ1YzEtYjVjZi0zYTk4OTQzN2ViZTgiLCJlbWFpbCI6InBhc3N3b3JkMTFAbWFpbC5jb20iLCJyb2xlIjoidXNlciIsInR5cGUiOiJhY2Nlc3MiLCJpYXQiOjE3NTk2MDc5OTQsImV4cCI6MTc1OTYwODg5NH0.hQBIutFeiA9gcpLxtrvPvmrkWeqnihJKbVjrtG3kJFg';
const socket = io(SERVER_URL, {
  auth: { token: TOKEN },
  transports: ['websocket'],
});

// Listen for connection
socket.on('connect', () => {
  console.log('Connected as socket id:', socket.id);

  // Join an auction room (optional, for real-time updates)
  const auctionId = '7a33f217-6483-4e98-a755-8e5e6cf7f2bc';
  socket.emit('joinAuction', auctionId, response => {
    console.log('Join auction response:', response);

    // Place a bid after joining
    socket.emit('placeBid', { auctionId, amount: 29 }, bidResponse => {
      console.log('Bid response:', bidResponse);
    });
  });
});

// Listen for new bids in the auction room
socket.on('newBid', data => {
  console.log('New bid received:', data);
});

// Listen for outbid notifications
socket.on('bid:outbid', data => {
  console.log('You have been outbid:', data);
});

// Handle errors
socket.on('connect_error', err => {
  console.error('Connection error:', err.message);
});
