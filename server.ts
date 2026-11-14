import 'dotenv/config';
import express, {type Request, type Response} from 'express';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  ServerAiError,
  generateExerciseSheetOnServer,
  regenerateSingleActivityOnServer,
} from './server/gemini.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

async function startServer() {
  const app = express();
  app.use(express.json({limit: '256kb'}));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ok: true});
  });

  app.post('/api/gemini/generate-sheet', async (req: Request, res: Response) => {
    const controller = new AbortController();
    req.on('close', () => {
      if (!res.writableEnded) {
        controller.abort();
      }
    });

    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const sheet = await generateExerciseSheetOnServer({
        model: (body as {model?: unknown}).model,
        payload: (body as {payload?: unknown}).payload,
        signal: controller.signal,
      });
      if (!res.headersSent) {
        res.json({sheet});
      }
    } catch (err) {
      if (res.headersSent) return;
      if (err instanceof ServerAiError) {
        res.status(err.status).json({error: err.code});
      } else {
        res.status(502).json({error: 'network'});
      }
    }
  });

  app.post('/api/gemini/regenerate-activity', async (req: Request, res: Response) => {
    const controller = new AbortController();
    req.on('close', () => {
      if (!res.writableEnded) {
        controller.abort();
      }
    });

    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const activity = await regenerateSingleActivityOnServer({
        model: (body as {model?: unknown}).model,
        payload: (body as {payload?: unknown}).payload,
        previousActivityName: (body as {previousActivityName?: unknown}).previousActivityName,
        signal: controller.signal,
      });
      if (!res.headersSent) {
        res.json({activity});
      }
    } catch (err) {
      if (res.headersSent) return;
      if (err instanceof ServerAiError) {
        res.status(err.status).json({error: err.code});
      } else {
        res.status(502).json({error: 'network'});
      }
    }
  });

  if (!isProd) {
    const {createServer: createViteServer} = await import('vite');
    const vite = await createViteServer({
      server: {middlewareMode: true},
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
