import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

const SCENES_DIR = path.resolve('public', 'scenes');
const SCENE_FILE = path.join(SCENES_DIR, 'myworld.scene');

export default defineConfig({
  plugins: [
    {
      name: 'scene-api',
      configureServer(server) {
        // Save scene
        server.middlewares.use('/api/save', (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end('Method Not Allowed');
            return;
          }

          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            if (!fs.existsSync(SCENES_DIR)) {
              fs.mkdirSync(SCENES_DIR, { recursive: true });
            }
            fs.writeFileSync(SCENE_FILE, body, 'utf-8');

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          });
        });

        // Load scene
        server.middlewares.use('/api/load', (req, res) => {
          res.setHeader('Content-Type', 'application/json');

          if (req.method !== 'GET') {
            res.statusCode = 405;
            res.end(JSON.stringify({ error: 'Method Not Allowed' }));
            return;
          }

          if (!fs.existsSync(SCENE_FILE)) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'No saved scene' }));
            return;
          }

          const content = fs.readFileSync(SCENE_FILE, 'utf-8');
          res.statusCode = 200;
          res.end(content);
        });
      },
    },
  ],
});