import IORedis from 'ioredis';
import logger from '../utils/logger.js';
import { env } from './env.js';

let client = null;
let wrapper = null;

function makeWrapper(ioredisClient) {
  return {
    // Expose status for readiness checks
    get status() {
      return ioredisClient.status;
    },

    // Basic commands
    async get(key) {
      return await ioredisClient.get(key);
    },

    async setEx(key, seconds, value) {
      // ioredis uses setex
      return await ioredisClient.setex(key, seconds, value);
    },

    async set(key, value, ...args) {
      // Pass-through: ioredis accepts additional arguments like 'PX', ms, 'NX'
      return await ioredisClient.set(key, value, ...args);
    },

    async del(keys) {
      if (Array.isArray(keys)) {
        if (keys.length === 0) return 0;
        return await ioredisClient.del(...keys);
      }
      return await ioredisClient.del(String(keys));
    },

    async incr(key) {
      // Basic increment
      return await ioredisClient.incr(key);
    },

    async scan(cursor = '0', options = {}) {
      // options: { MATCH, COUNT }
      const args = [cursor];
      if (options.MATCH) {
        args.push('MATCH', options.MATCH);
      }
      if (options.COUNT) {
        args.push('COUNT', options.COUNT);
      }
      const res = await ioredisClient.scan(...args);
      // ioredis returns [cursor, keys]
      return { cursor: res[0], keys: res[1] };
    },

    async eval(script, { keys = [], arguments: argv = [] } = {}) {
      // Use Redis EVAL with number of keys
      const numKeys = Array.isArray(keys) ? keys.length : 0;
      return await ioredisClient.eval(script, numKeys, ...(keys || []), ...(argv || []));
    },

    async ping() {
      return await ioredisClient.ping();
    },

    async ttl(key) {
      // Return TTL in seconds
      return await ioredisClient.ttl(key);
    },

    async expire(key, seconds) {
      return await ioredisClient.expire(key, seconds);
    },

    // Compatibility for libraries that call sendCommand(...args)
    async sendCommand(...args) {
      // If called with a single array param (e.g. [ 'INCR', 'key' ])
      let cmdArgs = args;
      if (args.length === 1 && Array.isArray(args[0])) cmdArgs = args[0];

      const [commandName, ...rest] = cmdArgs;

      // If the client exposes a direct method, call it
      if (typeof ioredisClient[commandName] === 'function') {
        return await ioredisClient[commandName](...rest);
      }

      // Otherwise build a Command object (ioredis supports Command)
      if (typeof IORedis.Command === 'function') {
        const cmd = new IORedis.Command(commandName, rest, { replyEncoding: 'utf8' });
        return await ioredisClient.sendCommand(cmd);
      }

      // As a last resort try sending raw args
      return await ioredisClient.sendCommand(cmdArgs);
    },

    async quit() {
      try {
        await ioredisClient.quit();
      } catch (e) {
        // ignore
      }
    },

    // Expose raw client if necessary
    raw() {
      return ioredisClient;
    },
  };
}

export async function getRedisClient() {
  if (wrapper && client && client.status === 'ready') return wrapper;

  if (!client) {
    // Create new ioredis client
    client = new IORedis({
      host: env.redis?.host || '127.0.0.1',
      port: env.redis?.port || 6379,
      password: env.redis?.password || undefined,
      tls: env.redis?.tls ? {} : undefined,
      // Recommended options
      lazyConnect: false,
      maxRetriesPerRequest: null,
    });

    client.on('connect', () => {
      logger.info('ioredis client connecting', { host: env.redis?.host, port: env.redis?.port });
    });

    client.on('ready', () => {
      logger.info('ioredis client ready', {
        host: env.redis?.host,
        port: env.redis?.port,
        auth: env.redis?.password ? 'enabled' : 'disabled',
        tls: env.redis?.tls ? 'enabled' : 'disabled',
      });
    });

    client.on('error', err => {
      logger.error('ioredis client error', { error: err?.message });
    });

    client.on('end', () => {
      logger.info('ioredis client connection ended');
    });
  }

  // Wait until ready
  try {
    if (client.status !== 'ready') {
      await new Promise((resolve, reject) => {
        function onReady() {
          cleanup();
          resolve();
        }

        function onError(err) {
          cleanup();
          reject(err);
        }

        function cleanup() {
          client.removeListener('ready', onReady);
          client.removeListener('error', onError);
        }

        client.once('ready', onReady);
        client.once('error', onError);
      });
    }
  } catch (err) {
    logger.error('Failed to connect ioredis client', { error: err?.message });
    throw err;
  }

  wrapper = makeWrapper(client);
  return wrapper;
}

export async function closeRedisClient() {
  if (wrapper) {
    try {
      await wrapper.quit();
    } catch (e) {
      // ignore
    }
    wrapper = null;
  }
  if (client) {
    try {
      await client.quit();
    } catch (e) {}
    client = null;
  }
}

export async function checkRedisHealth() {
  try {
    const r = await getRedisClient();
    await r.ping();
    return true;
  } catch (e) {
    logger.error('Redis health check failed', { error: e?.message });
    return false;
  }
}
