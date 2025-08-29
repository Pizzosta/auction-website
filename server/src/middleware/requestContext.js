import { AsyncLocalStorage } from 'async_hooks';
import { v4 as uuidv4 } from 'uuid';

const asyncLocalStorage = new AsyncLocalStorage();

export const requestContextMiddleware = (req, res, next) => {
  const requestId = uuidv4();

  asyncLocalStorage.run({ requestId }, () => {
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
  });
};

export const getRequestContext = () => asyncLocalStorage.getStore() || {};