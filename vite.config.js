import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

const SCENES_DIR = path.resolve('public', 'scenes');

export default defineConfig({
  plugins: [
    {
      name: 'scene-api',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = req.url;

          // --- List all scenes (GET /api/scenes) ---
          if (url === '/api/scenes' && req.method === 'GET') {
            res.setHeader('Content-Type', 'application/json');

            if (!fs.existsSync(SCENES_DIR)) {
              res.end(JSON.stringify([]));
              return;
            }

            const files = fs.readdirSync(SCENES_DIR)
              .filter(f => f.endsWith('.scene'))
              .map(f => f.slice(0, -6)); // remove '.scene' suffix

            res.statusCode = 200;
            res.end(JSON.stringify(files));
            return;
          }

          // --- Save scene (POST /api/save/:name) ---
          let match;
          if ((match = url.match(/^\/api\/save\/([\w-]+)$/)) && req.method === 'POST') {
            const name = match[1];

            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            req.on('end', () => {
              if (!fs.existsSync(SCENES_DIR)) {
                fs.mkdirSync(SCENES_DIR, { recursive: true });
              }
              const filePath = path.join(SCENES_DIR, `${name}.scene`);
              fs.writeFileSync(filePath, body, 'utf-8');

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: true }));
            });
            return;
          }

          // --- Load scene (GET /api/load/:name) ---
          if ((match = url.match(/^\/api\/load\/([\w-]+)$/)) && req.method === 'GET') {
            const name = match[1];
            const filePath = path.join(SCENES_DIR, `${name}.scene`);

            res.setHeader('Content-Type', 'application/json');

            if (!fs.existsSync(filePath)) {
              res.statusCode = 404;
              res.end(JSON.stringify({ error: 'Scene not found' }));
              return;
            }

            const content = fs.readFileSync(filePath, 'utf-8');
            res.statusCode = 200;
            res.end(content);
            return;
          }

          // Not an API route — pass through to Vite
          next();
        });
      },
    },
  ],
});
