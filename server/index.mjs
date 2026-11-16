// Practice Store: `node server/index.mjs` (env PORT=8080, HOST=127.0.0.1, RESET_TOKEN, BUGS, SESSION_SECRET, TRUST_PROXY=1).
import { createPracticeServer } from './app.mjs';
import { BUG_IDS, parseBugList } from './bugs.mjs';

const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || '127.0.0.1';
const server = createPracticeServer();

server.listen(port, host, () => {
  const bugs = [...parseBugList(process.env.BUGS)];
  console.log(`Practice Store on http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
  console.log(bugs.length ? `Bug switches ON: ${bugs.join(', ')}` : `Bug switches off (ids: ${BUG_IDS.join(', ')})`);
  if (!process.env.RESET_TOKEN) console.log('RESET_TOKEN is not set: POST /api/reset and GET /__reset will answer 403.');
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)));
