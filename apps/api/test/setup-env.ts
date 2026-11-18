// Runs before any test module is imported, so `config/env` validates against these values.
process.env.NODE_ENV = 'test';
process.env.MONGO_URI ??= 'mongodb://placeholder.invalid/printbi-test';
process.env.CORS_ORIGINS = 'http://localhost:5173';
