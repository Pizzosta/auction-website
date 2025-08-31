import express from 'express';
import multer from 'multer';
import { uploadProfileImageMiddleware, uploadAuctionImagesMiddleware } from '../src/middleware/uploadMiddleware.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const port = 3001;

// Middleware to parse JSON and urlencoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Test route for profile image upload (1 image)
app.post('/api/upload/profile', uploadProfileImageMiddleware, (req, res) => {
    try {
        // The uploaded file is available in req.uploadedFiles[0]
        res.status(200).json({
            success: true,
            message: 'Profile image uploaded successfully',
            file: req.uploadedFiles[0]
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Test route for auction images upload (up to 5 images)
app.post('/api/upload/auction', uploadAuctionImagesMiddleware, (req, res) => {
    try {
        // All uploaded files are available in req.uploadedFiles
        res.status(200).json({
            success: true,
            message: 'Auction image(s) uploaded successfully',
            files: req.uploadedFiles
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        error: err.message || 'Something went wrong!'
    });
});

// Start the server
app.listen(port, () => {
    console.log(`Test upload server running at http://localhost:${port}`);
    console.log('\nTest Profile Upload (1 image):');
    console.log(`curl -X POST http://localhost:${port}/api/upload/profile \
  -H "Content-Type: multipart/form-data" \
  -F "images=@/Users/pizzosta/Desktop/CODING/auction-website/test.jpg"`);
  
    console.log('\nTest Auction Upload (up to 5 images):');
    console.log(`curl -X POST http://localhost:${port}/api/upload/auction \
  -H "Content-Type: multipart/form-data" \
  -F "images=@/Users/pizzosta/Desktop/CODING/auction-website/test.jpg" \
  -F "images=@/Users/pizzosta/Desktop/CODING/auction-website/test.jpg"`);
});
