import swaggerAutogen from 'swagger-autogen';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import fs from 'fs';
import logger from './utils/logger.js';
import { env, validateEnv } from './config/env.js';

// Validate required environment variables once at startup
const missingVars = validateEnv();

if (missingVars.length > 0) {
    logger.error(`Missing required environment variables: ${missingVars.join(', ')}`);
    process.exit(1);
}
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();
const SWAGGER_FILE_PATH = join(__dirname, 'swagger-output.json');

const endpoints = [
   // join(__dirname, 'routes', '*.js') 
   join(__dirname, 'server.js')
];

const doc = {
    info: {
        title: 'Kawodze Auction Website API',
        version: '1.0.0',
        description: 'Comprehensive API documentation',
        contact: {
            name: 'API Support',
            url: 'https://kawodze.com/support ',
            email: 'support@kawodze.com'
        },
        license: {
            name: 'Apache 2.0',
            url: 'https://www.apache.org/licenses/LICENSE-2.0.html '
        }
    },
    host: env.isProd ? 'api.kawodze.com' : 'localhost:5001',
    basePath: '/',
    schemes: env.isProd ? ['https'] : ['http'],
    consumes: ['application/json'],
    produces: ['application/json'],
    securityDefinitions: {
        // will appear as “lock” icons in UI
        bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'JWT Authorization header using the Bearer scheme. Example: "Authorization: Bearer {token}"'
        },
    },
    security: [{ bearerAuth: [] }],
    tags: [
        { name: 'Feedback', description: 'Operations related to feedback and ratings' },
        { name: 'User', description: 'User management endpoints' },
        { name: 'Auction', description: 'Auction listing and bidding endpoints' },
        { name: 'Admin', description: 'Admin management endpoints' },
        { name: 'Stats', description: 'Stats management endpoints' },
        { name: 'Webhook', description: 'Webhook management endpoints' },
        { name: 'Watchlist', description: 'Watchlist management endpoints' },
        { name: 'Featured Auction', description: 'Featured Auction management endpoints' },
        { name: 'Auth', description: 'Authentication endpoints' },
        { name: 'Bid', description: 'Bid management endpoints' },
    ],
};

const generateAndLoadSwagger = async () => {
    try {
        await swaggerAutogen()(SWAGGER_FILE_PATH, endpoints, doc);
        logger.info('Swagger spec generated at', { outputFile: SWAGGER_FILE_PATH });
        
        if (fs.existsSync(SWAGGER_FILE_PATH)) {
            const content = fs.readFileSync(SWAGGER_FILE_PATH, 'utf8').trim();
            if (content) {
                return JSON.parse(content);
            }
        }
        return doc;
    } catch (e) {
        logger.error('Swagger generation failed, falling back to existing doc or minimal doc', {
            error: e?.message,
        });
        
        if (fs.existsSync(SWAGGER_FILE_PATH)) {
            try {
                const content = fs.readFileSync(SWAGGER_FILE_PATH, 'utf8').trim();
                if (content) {
                  return JSON.parse(content);
                }
            } catch (readErr) {
                // If read fails, fall through to minimal doc
            }
        }
        return doc; // Fallback Minimal doc object
    }
};

// Configure Swagger UI options
const swaggerUiOptions = {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Kawodze API Documentation',
    swaggerOptions: {
        docExpansion: 'list',
        filter: true,
        persistAuthorization: true,
        displayRequestDuration: true,
        defaultModelsExpandDepth: -1, // Hide schemas by default
        defaultModelExpandDepth: 3
    }
};

(async () => {
    const swaggerDoc = await generateAndLoadSwagger();
    router.use('/', swaggerUi.serve, swaggerUi.setup(swaggerDoc, swaggerUiOptions));
})();

export default router;