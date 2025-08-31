import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import axios from 'axios';
import FormData from 'form-data';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// API Configuration
const API_BASE_URL = 'http://localhost:5001/api';
const JWT_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OGFmYTkyMzA3ZjE5OTc4YWY0Y2Q0MzEiLCJlbWFpbCI6InJlZ3Rlc3QzQGV4YW1wbGUuY29tIiwicm9sZSI6InVzZXIiLCJpYXQiOjE3NTY1ODY0MzUsImV4cCI6MTc1NjY3MjgzNX0.-LIRJ3XKV1pIMk8y5OWBf15KL6wsRqCRQjariiZB67g';

// Path to the test image
const TEST_IMAGE_PATH = '/Users/pizzosta/Desktop/CODING/auction-website/test.jpg';

// Helper function to create form data with file
function createFormData(filePath, fieldName) {
    const form = new FormData();
    form.append(fieldName, fs.createReadStream(filePath));
    return form;
}

// Test profile picture upload
async function testProfileUpload() {
    try {
        console.log('🔄 Testing profile picture upload...');
        
        if (!fs.existsSync(TEST_IMAGE_PATH)) {
            throw new Error(`Test image not found at: ${TEST_IMAGE_PATH}`);
        }
        
        const form = createFormData(TEST_IMAGE_PATH, 'profilePicture');
        const headers = {
            ...form.getHeaders(),
            'Authorization': `Bearer ${JWT_TOKEN}`
        };
        
        const response = await axios.post(
            `${API_BASE_URL}/users/me/upload-picture`,
            form,
            { headers }
        );
        
        console.log('✅ Profile picture uploaded successfully!');
        console.log('📊 Response:', JSON.stringify(response.data, null, 2));
        
        return response.data.data;
    } catch (error) {
        console.error('❌ Error uploading profile picture:');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
        } else {
            console.error(error.message);
        }
        throw error;
    }
}

// Test creating auction with images
async function testCreateAuctionWithImages() {
    try {
        console.log('\n🔄 Testing create auction with images...');
        
        const auctionData = {
            title: 'Test Auction with Image',
            description: 'This is a test auction with an image',
            startingPrice: 100,
            endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
            category: 'Sports',
            // The image will be in req.uploadedFiles from the upload middleware
        };
        
        // Create form data with the image
        const form = createFormData(TEST_IMAGE_PATH, 'images');
        
        // Append other fields to form data
        Object.entries(auctionData).forEach(([key, value]) => {
            form.append(key, value);
        });
        
        const headers = {
            ...form.getHeaders(),
            'Authorization': `Bearer ${JWT_TOKEN}`
        };
        
        const response = await axios.post(
            `${API_BASE_URL}/auctions`,
            form,
            { headers }
        );
        
        console.log('✅ Auction created with images successfully!');
        console.log('📊 Response:', JSON.stringify(response.data, null, 2));
        
        return response.data.data;
    } catch (error) {
        console.error('❌ Error creating auction with images:');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
        } else {
            console.error(error.message);
        }
        throw error;
    }
}

// Test delete profile picture
async function testDeleteProfilePicture() {
    try {
        console.log('\n🔄 Testing profile picture deletion...');
        
        const response = await axios.delete(
            `${API_BASE_URL}/users/me/remove-picture`,
            {
                headers: {
                    'Authorization': `Bearer ${JWT_TOKEN}`
                }
            }
        );
        
        console.log('✅ Profile picture deleted successfully!');
        console.log('📊 Response:', JSON.stringify(response.data, null, 2));
        
        return response.data;
    } catch (error) {
        console.error('❌ Error deleting profile picture:');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
        } else {
            console.error(error.message);
        }
        throw error;
    }
}

// Main test function
async function runTests() {
    console.log('🚀 Starting upload tests...');
    
    try {
        // Test profile picture upload
        await testProfileUpload();
        
        // Test creating auction with images
        await testCreateAuctionWithImages();
        
        console.log('\n🎉 All tests completed successfully!');
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        process.exit(1);
    } finally {
        process.exit(0);
    }
}

// Run the tests
runTests();
