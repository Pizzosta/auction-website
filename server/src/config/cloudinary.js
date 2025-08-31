import { v2 as cloudinary } from 'cloudinary';
import logger from '../utils/logger.js';


export const getCloudinary = async () => {
    // Validate required environment variables
    const required = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
    const missingVars = required.filter(varName => !process.env[varName]);

    if (missingVars.length > 0) {
        const errorMessage = `Missing required Cloudinary environment variables: ${missingVars.join(', ')}`;
        logger.error(errorMessage);
        throw new Error(errorMessage);
    }

    // Configure Cloudinary
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
        secure: true
    });
    
    // Return the configured Cloudinary instance
    return cloudinary;
}

export const initializeCloudinary = async () => {
    try {
        await cloudinary.api.ping();
        logger.info('Cloudinary connected successfully');
        return cloudinary;
    } catch (error) {
        logger.error(`Cloudinary connection error: ${error.message}`);
        throw error;
    }
};

export default getCloudinary;