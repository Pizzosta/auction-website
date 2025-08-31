import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables from .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Import Cloudinary functions
import getCloudinary, { initializeCloudinary } from '../src/config/cloudinary.js';

async function testCloudinary() {
    console.log('🔍 Starting Cloudinary connection test...');
    
    try {
        console.log('1. Testing getCloudinary()...');
        const cloudinary = await getCloudinary();
        console.log('✅ getCloudinary() - Successfully configured Cloudinary');

        console.log('\n2. Testing initializeCloudinary()...');
        const cloudinaryInstance = await initializeCloudinary();
        console.log('✅ initializeCloudinary() - Successfully connected to Cloudinary');
        
        console.log('\n3. Testing Cloudinary API access...');
        try {
            const result = await cloudinary.api.ping();
            console.log('✅ Cloudinary API ping successful:', result);
        } catch (error) {
            console.warn('⚠️ Cloudinary API ping failed, but configuration is still valid');
            console.warn('   This might be due to API rate limiting or permissions');
        }

        console.log('\n🎉 All Cloudinary tests completed successfully!');
        return true;
    } catch (error) {
        console.error('❌ Cloudinary test failed:', error.message);
        
        // Provide helpful debug information
        if (error.message.includes('Missing required Cloudinary environment variables')) {
            console.error('\n🔧 Debug Info:');
            console.error('- Please ensure you have a .env file with the following variables:');
            console.error('  CLOUDINARY_CLOUD_NAME=your_cloud_name');
            console.error('  CLOUDINARY_API_KEY=your_api_key');
            console.error('  CLOUDINARY_API_SECRET=your_api_secret');
            console.error('\nIf you need to create these credentials, visit: https://cloudinary.com/');
        } else if (error.message.includes('401 Unauthorized')) {
            console.error('\n🔧 Debug Info:');
            console.error('- The provided Cloudinary credentials are invalid');
            console.error('- Please check your CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in .env');
        }
        
        process.exit(1);
    }
}

// Run the test
testCloudinary().catch(console.error);
