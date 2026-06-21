import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: Number(process.env.PORT || 3000),
  jwtSecret: process.env.JWT_SECRET || 'dev-insecure-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  hipaaAuditLog: (process.env.HIPAA_AUDIT_LOG_ENABLED ?? 'true') === 'true',
  nodeEnv: process.env.NODE_ENV || 'development',
};

if (config.jwtSecret === 'dev-insecure-secret-change-me' && config.nodeEnv === 'production') {
  // eslint-disable-next-line no-console
  console.warn('[config] WARNING: JWT_SECRET is using the insecure default in production. Set JWT_SECRET.');
}
