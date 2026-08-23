import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
function ad88ApiPlugin() {
    return {
        name: 'ad88-local-api',
        configureServer(server) {
            server.middlewares.use('/api/market', async (req, res) => {
                try {
                    const requestUrl = new URL(req.url ?? '', 'http://127.0.0.1');
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
                }
                catch (error) {
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
                }
                catch (error) {
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
            '/api/auth': 'http://127.0.0.1:10000',
            '/api/admin': 'http://127.0.0.1:10000',
            '/api/sync': 'http://127.0.0.1:10000',
        },
    },
});
