import { v2 as cloudinary } from 'cloudinary';
import logger from '../utils/logger.js';
import { env } from '../config/env.js';


export const getCloudinary = async () => {
    // Validate required environment variables
    const required = [env.cloudinary.cloudName, env.cloudinary.apiKey, env.cloudinary.apiSecret];
    const missingVars = required.filter(varName => !varName);

    if (missingVars.length > 0) {
        const errorMessage = `Missing required Cloudinary environment variables: ${missingVars.join(', ')}`;
        logger.error(errorMessage);
        throw new Error(errorMessage);
    }

    // Configure Cloudinary
    cloudinary.config({
        cloud_name: env.cloudinary.cloudName,
        api_key: env.cloudinary.apiKey,
        api_secret: env.cloudinary.apiSecret,
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