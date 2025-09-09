import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import express from 'express';

const router = express.Router();

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Kawodze Auction Website API',
      version: '1.0.0',
      description: 'API documentation for the Kawodze Auction Website',
    },
    servers: [
      {
        url: 'http://localhost:5001',
      },
    ],
  },
  apis: ['./src/routes/*.js', './src/controllers/*.js'], // Path to the API docs
};

const specs = swaggerJsdoc(options);

router.use('/', swaggerUi.serve, swaggerUi.setup(specs));

export default router;
