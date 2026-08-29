import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ViteDevServer } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localApiOrigin = process.env.AD88_LOCAL_API_ORIGIN || 'http://127.0.0.1:10000';

function ad88ApiPlugin() {
  return {
    name: 'ad88-local-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api/market', async (req, res) => {
        try {
          // Use the same Node API server as the deployed services whenever it
          // is running. The previous dev-only Yahoo handler treated
          // /api/market/quotes as a chart request, which made the ticker and
          // selected chart consume different data shapes during local tests.
          const suffix = req.url ?? '';
          const localPath = suffix === '/' || suffix === '' ? '/api/market' : `/api/market${suffix}`;
          try {
            const localResponse = await fetch(`${localApiOrigin}${localPath}`, { signal: AbortSignal.timeout(1500), headers: { accept: 'application/json' } });
            const localType = localResponse.headers.get('content-type') || '';
            if (localResponse.ok && localType.includes('application/json')) {
              res.statusCode = localResponse.status;
              res.setHeader('content-type', localType);
              res.end(await localResponse.text());
              return;
            }
          } catch {
            // Fall through to the public chart endpoint for a Vite-only setup.
          }
          const requestUrl = new URL(req.url ?? '', 'http://127.0.0.1');
          if (requestUrl.pathname === '/quotes') {
            res.statusCode = 502;
            res.setHeader('content-type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: 'local market API server is not running' }));
            return;
          }
          const symbol = requestUrl.searchParams.get('symbol') || 'GC=F';
          if (!/^[A-Z0-9=^.-]+$/.test(symbol)) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'invalid market symbol' }));
            return;
          }
          const upstream = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
          upstream.searchParams.set('range', requestUrl.searchParams.get('range') || '1d');
          upstream.searchParams.set('interval', requestUrl.searchParams.get('interval') || '15m');
          const response = await fetch(upstream, {
            signal: AbortSignal.timeout(8000),
            headers: { 'User-Agent': 'AD88/1.0' },
          });
          const text = await response.text();
          res.statusCode = response.status;
          res.setHeader('content-type', 'application/json; charset=utf-8');
          res.end(text);
        } catch (error) {
          res.statusCode = 502;
          res.setHeader('content-type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'market upstream failed' }));
        }
      });

      server.middlewares.use('/api/news', async (req, res) => {
        try {
          const requestUrl = new URL(req.url ?? '', 'http://127.0.0.1');
          const query = requestUrl.searchParams.get('query') || 'bitcoin crypto markets';
          const upstream = new URL('https://query1.finance.yahoo.com/v1/finance/search');
          upstream.searchParams.set('q', query);
          upstream.searchParams.set('newsCount', '12');
          upstream.searchParams.set('quotesCount', '0');
          const response = await fetch(upstream, {
            signal: AbortSignal.timeout(8000),
            headers: { 'User-Agent': 'AD88/1.0' },
          });
          const text = await response.text();
          res.statusCode = response.status;
          res.setHeader('content-type', 'application/json; charset=utf-8');
          res.end(text);
        } catch (error) {
          res.statusCode = 502;
          res.setHeader('content-type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'news upstream failed' }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), ad88ApiPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api/auth': localApiOrigin,
      '/api/admin': localApiOrigin,
      '/api/support': localApiOrigin,
      '/api/trades': localApiOrigin,
      '/api/paper': localApiOrigin,
      '/api/sync': localApiOrigin,
      '/api/credits': localApiOrigin,
      '/api/ledger': localApiOrigin,
      '/api/funding': localApiOrigin,
      '/api/notifications': localApiOrigin,
      '/api/profile': localApiOrigin,
      '/api/content-settings': localApiOrigin,
      '/api/market-scenarios': localApiOrigin,
      '/api/market/status': localApiOrigin,
    },
  },
});
