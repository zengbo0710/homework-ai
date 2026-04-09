import { buildApp } from './app';

const app = buildApp();

app.listen({ port: 3001, host: '0.0.0.0' }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log('API running on http://0.0.0.0:3001');
});
