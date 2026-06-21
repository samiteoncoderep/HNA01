import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { config } from './config';
import authRoutes from './routes/auth';
import onboardingRoutes from './routes/onboarding';
import sessionRoutes from './routes/sessions';
import profileRoutes from './routes/profile';

const app = express();

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Health check (Railway uses this)
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'hnaas-care-navigator', ts: new Date().toISOString() }));

// API
app.use('/api/auth', authRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api', profileRoutes);

// Static frontend
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  return res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Error handler
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // eslint-disable-next-line no-console
  console.error('[error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] HNaaS Care Navigator listening on :${config.port} (${config.nodeEnv})`);
});

export default app;
