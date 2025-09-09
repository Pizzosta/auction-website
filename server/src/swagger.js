import swaggerAutogen from 'swagger-autogen';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const outputFile = path.join(__dirname, 'swagger-output.json');
const endpoints = [path.join(__dirname, 'server.js')];

const router = express.Router();

const swaggerDoc = JSON.parse(
    fs.readFileSync(path.resolve('src/swagger-output.json'), 'utf-8')
);

const doc = {
    info: {
        title: 'Kawodze Auction Website API',
        version: '1.0.0',
        description: 'API documentation for the Kawodze Auction Website'
    },
    host: 'localhost:5001',
    basePath: '/',
    schemes: ['http', 'https'],
    securityDefinitions: {           // will appear as “lock” icons in UI
        bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT'
        }
    }
};

swaggerAutogen()(outputFile, endpoints, doc).then(() => {
    console.log('Swagger spec generated at', outputFile);
    // optionally start server here if you want to auto-generate + run
});

router.use('/', swaggerUi.serve, swaggerUi.setup(swaggerDoc, { explorer: true }));

export default router;
