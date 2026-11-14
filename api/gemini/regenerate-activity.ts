import type {VercelRequest, VercelResponse} from '@vercel/node';
import {ServerAiError, regenerateSingleActivityOnServer} from '../../server/gemini.ts';

function parseBody(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({error: 'Method not allowed'});
  }

  const controller = new AbortController();
  req.on('close', () => {
    if (!res.writableEnded) {
      controller.abort();
    }
  });

  try {
    const body = parseBody(req.body);
    const activity = await regenerateSingleActivityOnServer({
      model: body.model,
      payload: body.payload,
      previousActivityName: body.previousActivityName,
      signal: controller.signal,
    });
    if (!res.headersSent) {
      return res.status(200).json({activity});
    }
  } catch (err) {
    if (res.headersSent) return;
    if (err instanceof ServerAiError) {
      return res.status(err.status).json({error: err.code});
    }
    return res.status(502).json({error: 'network'});
  }
}
