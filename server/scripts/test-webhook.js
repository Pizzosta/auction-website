// test-webhook.js
import crypto from 'crypto';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables from server/.env
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const PORT = process.env.PORT || 5001;

if (!WEBHOOK_SECRET) {
  console.error('Error: WEBHOOK_SECRET is not set in .env file');
  process.exit(1);
}

// Generate current timestamp
const timestamp = Math.floor(Date.now() / 1000);
const payload = { test: 'data' };
const event = 'test.event';
const delivery = '123e4567-e89b-12d3-a456-426614174000';

// Create signature that matches the server's verification
const signaturePayload = `${timestamp}.${JSON.stringify(payload)}`;
const signature = crypto
  .createHmac('sha256', WEBHOOK_SECRET)
  .update(signaturePayload)
  .digest('hex');

console.log('Webhook Test Configuration:');
console.log('--------------------------');
console.log(`Endpoint: http://localhost:${PORT}/webhook`);
console.log(`Timestamp: ${timestamp} (${new Date(timestamp * 1000).toISOString()})`);
console.log('Payload:', JSON.stringify(payload, null, 2));
console.log('Signature Payload:', signaturePayload);
console.log('Generated Signature:', signature);
console.log('--------------------------\n');

const userAgent = 'KawodzeAuction/1.0.0';

const curlCommand = `curl -X POST http://localhost:${PORT}/webhook \\
  -H "Content-Type: application/json" \\
  -H "User-Agent: ${userAgent}" \\
  -H "X-Webhook-Event: ${event}" \\
  -H "X-Webhook-Signature: ${signature}" \\
  -H "X-Webhook-Delivery: ${delivery}" \\
  -H "X-Request-Timestamp: ${timestamp}" \\
  -d '${JSON.stringify(payload)}'`;

console.log('Test Webhook Command:\n-------------------');
console.log(curlCommand);

console.log('\nNode.js fetch example:');

const fetchCode = `
import fetch from 'node-fetch';

const userAgent = 'KawodzeAuction/1.0.0';

fetch('http://localhost:${PORT}/webhook', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'User-Agent': userAgent,
    'X-Webhook-Event': '${event}',
    'X-Webhook-Signature': '${signature}',
    'X-Webhook-Delivery': '${delivery}',
    'X-Request-Timestamp': '${timestamp}'
  },
  body: JSON.stringify(${JSON.stringify(payload, null, 2)})
})
  .then(res => res.json())
  .then(console.log)
  .catch(console.error);
`;

console.log(fetchCode);