
import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import logger from './utils/logger.js';
import { env, validateEnv } from './config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

// Validate required environment variables
const missingVars = validateEnv();
if (missingVars.length > 0) {
    logger.error(`Missing required environment variables: ${missingVars.join(', ')}`);
    process.exit(1);
}

// Swagger configuration
const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Kawodze Auction Website API',
            version: '1.0.0',
            description: 'Comprehensive API documentation for Kawodze Auction Platform',
            contact: {
                name: 'API Support',
                url: 'https://kawodze.com/support',
                email: 'support@kawodze.com'
            },
            license: {
                name: 'Apache 2.0',
                url: 'https://www.apache.org/licenses/LICENSE-2.0.html'
            }
        },
        servers: [
            {
                url: env.isProd ? 'https://api.kawodze.com' : `http://localhost:${env.port || 5001}`,
                description: env.isProd ? 'Production Server' : 'Development Server'
            }
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT'
                }
            }
        }
    },
    apis: [
        join(__dirname, 'routes', '*.js'),        // Scan all route files
        join(__dirname, 'routes', '**', '*.js')   // Scan subdirectories
    ]
};

// Initialize swagger-jsdoc with error handling
let swaggerSpec;
try {
    swaggerSpec = swaggerJSDoc(options);
    logger.info('Swagger specification generated successfully');
} catch (error) {
    logger.error('Failed to generate Swagger specification:', error);
    // Provide a minimal swagger spec if generation fails
    swaggerSpec = {
        openapi: '3.0.0',
        info: {
            title: 'Kawodze API',
            version: '1.0.0',
            description: 'API documentation is currently unavailable due to generation error.'
        }
    };
}

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
        defaultModelsExpandDepth: -1,
        defaultModelExpandDepth: 3
    }
};

// Serve Swagger UI
router.use('/', swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerUiOptions));

// Add a route to get the raw JSON spec
router.get('/json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
});

logger.info('Swagger documentation initialized with JSDoc comments');

export default router;