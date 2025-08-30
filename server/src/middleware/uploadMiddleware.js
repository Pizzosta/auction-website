import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import { promisify } from 'util';
import { unlink } from 'fs/promises';
import logger from '../utils/logger.js';
import getCloudinary from '../config/cloudinary.js';

// Configure multer for memory storage (file is stored in memory as buffer)
const storage = multer.memoryStorage();

// File filter function
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only JPG, JPEG, PNG, and WEBP are allowed.'), false);
    }
};

// Configure multer instances for different upload types
const createUploader = (maxFiles) => multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit per file
        files: maxFiles
    },
    fileFilter: fileFilter
});

// Create uploaders for different purposes
const profileUploader = createUploader(1); // Only 1 file for profile
const auctionUploader = createUploader(5); // Up to 5 files for auctions

// Convert upload.array() to use promises
const processUpload = (uploader, req, res) => {
    return new Promise((resolve, reject) => {
        const fieldName = req.fileFieldName || 'images';
        const maxCount = req.uploadType === 'profile' ? 1 : 5;
        uploader.array(fieldName, maxCount)(req, res, (err) => {
            if (err) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return reject(new Error('File size too large. Maximum size is 5MB per file.'));
                } else if (err.code === 'LIMIT_FILE_COUNT') {
                    return reject(new Error('Too many files. Maximum 5 files allowed.'));
                } else if (err.message) {
                    return reject(new Error(err.message));
                }
                return reject(new Error('Error uploading files.'));
            }
            if (!req.files || req.files.length === 0) {
                return reject(new Error('No files were uploaded.'));
            }
            resolve();
        });
    });
};

// Base folder for all uploads
const BASE_FOLDER = 'kawodze-auction';

// Profile picture upload middleware (single image)
export const uploadProfileImageMiddleware = async (req, res, next) => {
    req.uploadType = 'profile';
    req.fileFieldName = 'profilePicture';
    return handleUpload(profileUploader, `${BASE_FOLDER}/profile-images`, req, res, next);
};

// Auction images upload middleware (up to 5 images)
export const uploadAuctionImagesMiddleware = async (req, res, next) => {
    req.uploadType = 'auction';
    return handleUpload(auctionUploader, `${BASE_FOLDER}/auction-uploads`, req, res, next);
};

// Main upload handler
const handleUpload = async (uploader, folder, req, res, next) => {
    try {
        await processUpload(uploader, req, res);
        
        // Get Cloudinary instance
        const cloudinary = await getCloudinary();
        
        // Process each file
        const files = req.files || [];
        const uploadPromises = files.map(async (file) => {
            try {
                // Convert buffer to base64
                const b64 = Buffer.from(file.buffer).toString('base64');
                const dataURI = `data:${file.mimetype};base64,${b64}`;
                
                // Upload to Cloudinary
                const result = await cloudinary.uploader.upload(dataURI, {
                    folder: folder,
                    resource_type: 'auto',
                    format: file.mimetype.split('/')[1], // Extract format from mimetype
                    transformation: [
                        { width: 1000, height: 1000, crop: 'limit' },
                        { quality: 'auto:good' }
                    ]
                });
                
                return {
                    url: result.secure_url,
                    publicId: result.public_id,
                    format: result.format,
                    size: result.bytes,
                    width: result.width,
                    height: result.height
                };
            } catch (error) {
                logger.error('Error uploading file to Cloudinary:', error);
                throw new Error(`Failed to upload ${file.originalname}`);
            }
        });
        
        // Wait for all uploads to complete
        const uploadedFiles = await Promise.all(uploadPromises);
        
        // Attach the uploaded files to the request object
        req.uploadedFiles = uploadedFiles;
        next();
        
    } catch (error) {
        logger.error('Upload middleware error:', error);
        
        // Clean up any files that might have been uploaded before the error
        if (req.uploadedFiles && req.uploadedFiles.length > 0) {
            await Promise.all(
                req.uploadedFiles.map(file => 
                    cloudinary.uploader.destroy(file.publicId).catch(console.error)
                )
            );
        }
        
        res.status(400).json({
            success: false,
            error: error.message || 'Error processing uploads'
        });
    }
};

// Helper function to delete files from Cloudinary
export const deleteFromCloudinary = async (publicId) => {
    try {
        const cloudinary = await getCloudinary();
        await cloudinary.uploader.destroy(publicId);
        return true;
    } catch (error) {
        logger.error('Error deleting file from Cloudinary:', error);
        return false;
    }
};

// Helper function to handle multiple deletions
export const deleteMultipleFromCloudinary = async (publicIds) => {
    try {
        const cloudinary = await getCloudinary();
        const results = await Promise.all(
            publicIds.map(publicId => 
                cloudinary.uploader.destroy(publicId).catch(e => ({
                    publicId,
                    success: false,
                    error: e.message
                }))
            )
        );
        return results;
    } catch (error) {
        logger.error('Error deleting files from Cloudinary:', error);
        throw error;
    }
};
