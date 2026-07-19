import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  // Points at compiled output: drizzle-kit's loader can't resolve the
  // NodeNext-style `.js` extension imports used in src. Run build first.
  schema: './dist/schema/index.js',
  out: './migrations',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ?? 'postgres://schoolmate:schoolmate_dev@localhost:5433/schoolmate',
  },
  strict: true,
  verbose: true,
});
