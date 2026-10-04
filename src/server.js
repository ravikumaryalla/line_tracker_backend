const express = require('express');
const cors = require('cors');
const { ensureSchema } = require('./db/schema');
const bootstrapAdmin = require('./db/bootstrapAdmin');
const { requireAuth, requireRole } = require('./middleware/auth');

const authRouter = require('./routes/auth');
const usersRouter = require('./routes/users');
const villagesRouter = require('./routes/villages');
const customersRouter = require('./routes/customers');
const expensesRouter = require('./routes/expenses');
const lossesRouter = require('./routes/losses');
const dashboardRouter = require('./routes/dashboard');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => res.json({
  ok: true,
  commit: process.env.RENDER_GIT_COMMIT || 'unknown',
}));
app.use('/api/auth', authRouter);
// The app is admin-only: every data route needs a signed-in admin.
const adminOnly = [requireAuth, requireRole('admin')];
app.use('/api/users', adminOnly, usersRouter);
app.use('/api/villages', adminOnly, villagesRouter);
app.use('/api/customers', adminOnly, customersRouter);
app.use('/api/expenses', adminOnly, expensesRouter);
app.use('/api/losses', adminOnly, lossesRouter);
app.use('/api/dashboard', adminOnly, dashboardRouter);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;

async function start() {
  await ensureSchema();
  await bootstrapAdmin();
  app.listen(PORT, () => console.log(`Lending Collection backend listening on http://localhost:${PORT}`));
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
