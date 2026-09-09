import app from '../server.js';

export default function handler(req, res) {
  // Normalize req.url for Vercel Serverless Function routing
  if (req && req.url) {
    if (req.url.startsWith('/api/index.js')) {
      const urlObj = new URL(req.url, 'http://localhost');
      const target = urlObj.searchParams.get('path') || urlObj.searchParams.get('url') || req.headers['x-matched-path'];
      if (target) {
        req.url = target.startsWith('/api') ? target : `/api${target.startsWith('/') ? '' : '/'}${target}`;
      }
    } else if (!req.url.startsWith('/api') && !req.url.startsWith('/components')) {
      req.url = `/api${req.url.startsWith('/') ? '' : '/'}${req.url}`;
    }
  }
  return app(req, res);
}

