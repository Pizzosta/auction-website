/*
import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import express from 'express';
import { env, validateEnv } from './config/env.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import logger from './utils/logger.js';

// Validate required environment variables once at startup
const missingVars = validateEnv();

if (missingVars.length > 0) {
    logger.error(`Missing required environment variables: ${missingVars.join(', ')}`);
    process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

// Define the API routes directory
const routesDir = path.join(__dirname, 'routes');

const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Kawodze Auction Website API',
            version: '1.0.0',
            description: 'Comprehensive API documentation for the Kawodze Auction Website',
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
                url: env.isProd ? 'https://api.kawodze.com' : 'http://localhost:5001',
                description: env.isProd ? 'Production Server' : 'Development Server',
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'JWT Authorization header using the Bearer scheme. Example: "Authorization: Bearer {token}"'
                },
            },
        },
        security: [{
            bearerAuth: []
        }],
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
    },
    apis: [
        `${routesDir}/*.js`,
        `${__dirname}/models/*.js`,
    ]
};

// Initialize swagger-jsdoc
let swaggerSpec;
try {
    swaggerSpec = swaggerJSDoc(swaggerOptions);

    // Generate and save the OpenAPI spec
    const outputFile = path.join(__dirname, 'swagger-output.json');
    fs.writeFileSync(outputFile, JSON.stringify(swaggerSpec, null, 2));
    logger.info(`Swagger documentation generated at ${outputFile}`);

    // Log available routes for debugging
    if (swaggerSpec.paths) {
        const routes = Object.keys(swaggerSpec.paths);
        logger.info(`Documented ${routes.length} API endpoints`);
    } else {
        logger.warn('No API endpoints found in the documentation');
    }
} catch (error) {
    logger.error('Error generating Swagger documentation:', error);
    throw error;
}

// Serve Swagger UI
const swaggerUiOptions = {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    swaggerOptions: {
        docExpansion: 'list',
        filter: true,
        persistAuthorization: true,
        displayRequestDuration: true,
    },
};

router.use('/', swaggerUi.serve);
router.get('/', swaggerUi.setup(swaggerSpec, swaggerUiOptions));

// Add a route to get the raw JSON spec
router.get('/json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
});

export default router;
*/


import swaggerAutogen from 'swagger-autogen';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import fs from 'fs';
import logger from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const outputFile = path.join(__dirname, 'swagger-output.json');
const endpoints = [path.join(__dirname, 'server.js')];

const router = express.Router();

const swaggerOutputPath = path.resolve('src/swagger-output.json');

const doc = {
  info: {
    title: 'Kawodze Auction Website API',
    version: '1.0.0',
    description: 'API documentation for the Kawodze Auction Website',
  },
  host: 'localhost:5001',
  basePath: '/',
  schemes: ['http', 'https'],
  securityDefinitions: {
    // will appear as “lock” icons in UI
    bearerAuth: {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    },
  },
};

const generateAndLoadSwagger = async () => {
  try {
    await swaggerAutogen()(outputFile, endpoints, doc);
    logger.info('Swagger spec generated at', { outputFile });
    if (fs.existsSync(swaggerOutputPath)) {
      const content = fs.readFileSync(swaggerOutputPath, 'utf8').trim();
      if (content) {
        const generated = JSON.parse(content);
        return generated;
      }
    }
    return doc;
  } catch (e) {
    logger.error('Swagger generation failed, falling back to existing doc or minimal doc', {
      error: e?.message,
    });
    if (fs.existsSync(swaggerOutputPath)) {
      try {
        const content = fs.readFileSync(swaggerOutputPath, 'utf8').trim();
        if (content) return JSON.parse(content);
      } catch (readErr) {
        // ignore and fall through
      }
    }
    return doc;
  }
};

(async () => {
  const swaggerDoc = await generateAndLoadSwagger();
  router.use('/', swaggerUi.serve, swaggerUi.setup(swaggerDoc, { explorer: true }));
})();

export default router;



import swaggerAutogen from 'swagger-autogen';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import fs from 'fs';
import logger from './utils/logger.js';
import { env } from './config/env.js';

// Configure paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const outputFile = path.join(__dirname, 'swagger-output.json');
const endpoints = [
  path.join(__dirname, 'routes/*.js'),
  path.join(__dirname, 'routes/**/*.js')
];

const router = express.Router();
const swaggerOutputPath = path.resolve('src/swagger-output.json');

// Base Swagger configuration
const doc = {
  info: {
    title: 'Kawodze Auction Website API',
    version: '1.0.0',
    description: 'Comprehensive API documentation for the Kawodze Auction Platform',
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
  host: env.isProd ? 'api.kawodze.com' : 'localhost:5001',
  basePath: '/',
  schemes: env.isProd ? ['https'] : ['http'],
  consumes: ['application/json'],
  produces: ['application/json'],
  securityDefinitions: {
    bearerAuth: {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'JWT Authorization header using the Bearer scheme. Example: "Authorization: Bearer {token}"'
    }
  },
  security: [{
    bearerAuth: []
  }],
  tags: [
    {
      name: 'Authentication',
      description: 'User authentication and authorization endpoints'
    },
    {
      name: 'Auctions',
      description: 'Auction management endpoints'
    },
    {
      name: 'Users',
      description: 'User management endpoints'
    },
    {
      name: 'Bids',
      description: 'Bid management endpoints'
    },
    {
      name: 'Admin',
      description: 'Administrative endpoints'
    }
  ]
};

/**
 * Generates and loads the Swagger documentation
 * @returns {Promise<object>} The generated Swagger documentation
 */
const generateAndLoadSwagger = async () => {
  try {
    logger.info('Generating Swagger documentation...');
    
    // Only generate in development or if file doesn't exist
    if (!fs.existsSync(outputFile) || !env.isProd) {
      const swaggerAutogenInstance = swaggerAutogen({
        openapi: '3.0.0',
        language: 'en-US',
        autoHeaders: true,
        autoQuery: true,
        autoBody: true
      });
      
      await swaggerAutogenInstance(outputFile, endpoints, doc);
      logger.info(`Swagger documentation generated at: ${outputFile}`);
    }

    if (fs.existsSync(swaggerOutputPath)) {
      const content = fs.readFileSync(swaggerOutputPath, 'utf8').trim();
      if (content) {
        return JSON.parse(content);
      }
    }
    
    return doc;
  } catch (error) {
    logger.error('Failed to generate Swagger documentation:', {
      error: error.message,
      stack: error.stack
    });
    
    // Fallback to existing doc or minimal doc
    if (fs.existsSync(swaggerOutputPath)) {
      try {
        const content = fs.readFileSync(swaggerOutputPath, 'utf8').trim();
        if (content) return JSON.parse(content);
      } catch (readError) {
        logger.error('Failed to read existing Swagger file:', {
          error: readError.message
        });
      }
    }
    
    return doc;
  }
};

// Initialize Swagger UI
let isSwaggerInitialized = false;

const initializeSwagger = async () => {
  if (isSwaggerInitialized) return;
  
  try {
    const swaggerDoc = await generateAndLoadSwagger();
    
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
    
    // Setup Swagger UI
    router.use('/', swaggerUi.serve, swaggerUi.setup(swaggerDoc, swaggerUiOptions));
    
    // Add a route to get the raw JSON spec
    router.get('/json', (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(swaggerDoc);
    });
    
    isSwaggerInitialized = true;
    logger.info('Swagger UI initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Swagger UI:', {
      error: error.message,
      stack: error.stack
    });
    
    // Fallback to error message
    router.use('/', (req, res) => {
      res.status(500).json({
        error: 'Failed to load API documentation',
        message: 'Please check the server logs for more information'
      });
    });
  }
};

// Initialize Swagger when the module loads
initializeSwagger().catch(error => {
  logger.error('Unhandled error during Swagger initialization:', error);
});

export default router;