import express from 'express';
import serverless from 'serverless-http';
import { createApp } from '../../server/app.ts';
import { ensureStoreHydrated, flushRemoteStore } from '../../server/store.ts';

const entryApp = express();
const apiApp = createApp();

entryApp.use((req, _res, next) => {
  const url = req.url || '/';
  if (url.startsWith('/.netlify/functions/api')) {
    const rest = url.slice('/.netlify/functions/api'.length);
    req.url = `/api${rest.startsWith('/') || rest.startsWith('?') || rest === '' ? rest : `/${rest}`}`;
  } else if (!url.startsWith('/api/') && url !== '/api' && !url.startsWith('/api?')) {
    req.url = `/api${url.startsWith('/') ? url : `/${url}`}`;
  }
  next();
});

entryApp.use(apiApp);

const serverlessHandler = serverless(entryApp);

export const handler = async (event: unknown, context: unknown) => {
  await ensureStoreHydrated();
  const result = await serverlessHandler(event as never, context as never);
  await flushRemoteStore();
  return result;
};
