import serverless from 'serverless-http';
import { app, ensureDb } from '../../server.js';

const proxy = serverless(app, {
  basePath: "/.netlify/functions/api"
});

export const handler = async (event, context) => {
  try {
    await ensureDb();
    return await proxy(event, context);
  } catch (e) {
    console.error(e);
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        error: 'Server/database belum siap. Periksa environment variables dan database.'
      })
    };
  }
};
