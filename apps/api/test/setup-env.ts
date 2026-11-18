// Runs before any test module is imported, so `config/env` validates against these values.
process.env.NODE_ENV = 'test';
process.env.MONGO_URI ??= 'mongodb://placeholder.invalid/printbi-test';
process.env.CORS_ORIGINS = 'http://localhost:5173';
process.env.JWT_ACCESS_SECRET = 'test-secret-that-is-long-enough-for-hs256-signing';
process.env.AUTH_RATE_LIMIT = '10000';
