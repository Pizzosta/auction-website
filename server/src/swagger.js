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
