import { createServer } from 'http';
import { app } from '../src/server.js';

export const createTestServer = async () => {
  console.log('Creating test server...');
  
  // Create a new HTTP server instance
  const httpServer = createServer(app);
  
  // Start the server on a random available port
  console.log('Starting server on random port...');
  await new Promise((resolve, reject) => {
    httpServer.listen(0, () => {
      console.log('Server started successfully');
      resolve();
    }).on('error', (err) => {
      console.error('Error starting server:', err);
      reject(err);
    });
  });
  
  const address = httpServer.address();
  const port = typeof address === 'string' ? 0 : address.port;
  console.log(`Server listening on port ${port}`);
  
  // Return an object with the server and a stop function
  return {
    server: httpServer,
    app: app,
    port: port,
    stop: async () => {
      return new Promise((resolve, reject) => {
        if (!httpServer) return resolve();
        
        httpServer.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  };
};

