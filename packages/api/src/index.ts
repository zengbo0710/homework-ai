import { buildApp } from './app';

const app = buildApp();

const port = parseInt(process.env.PORT ?? '3001', 10);

app.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`API running on http://0.0.0.0:${port}`);
});
