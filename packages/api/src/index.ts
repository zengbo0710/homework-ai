import { config } from 'dotenv';
config(); // loads packages/api/.env when running locally

import { execSync } from 'child_process';
import path from 'path';
import { buildApp } from './app';

const schemaPath = path.resolve(__dirname, '..', 'prisma', 'schema.prisma');

// Run migrations and seed on every startup so the DB is always up-to-date.
// Both commands are idempotent: migrate deploy skips applied migrations,
// and seed upserts only missing rows.
try {
  console.log('Running database migrations…');
  execSync(`npx prisma migrate deploy --schema="${schemaPath}"`, { stdio: 'inherit' });
  console.log('Running database seed…');
  execSync(`npx prisma db seed --schema="${schemaPath}"`, { stdio: 'inherit' });
} catch (err) {
  console.error('DB setup failed:', err);
  process.exit(1);
}

const app = buildApp();
const port = parseInt(process.env.PORT ?? '3001', 10);

app.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`API running on http://0.0.0.0:${port}`);
});
