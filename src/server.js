const express = require('express');
const cors = require('cors');
const { ensureSchema } = require('./db/schema');
const seed = require('./db/seed');
const bootstrapAdmin = require('./db/bootstrapAdmin');
const { requireAuth, requireRole } = require('./middleware/auth');

const authRouter = require('./routes/auth');
const usersRouter = require('./routes/users');
const agentsRouter = require('./routes/agents');
const villagesRouter = require('./routes/villages');
const customersRouter = require('./routes/customers');
const expensesRouter = require('./routes/expenses');
const lossesRouter = require('./routes/losses');
const dashboardRouter = require('./routes/dashboard');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api/users', requireAuth, requireRole('admin'), usersRouter);
app.use('/api/agents', requireAuth, agentsRouter);
app.use('/api/villages', requireAuth, villagesRouter);
app.use('/api/customers', requireAuth, customersRouter);
app.use('/api/expenses', requireAuth, expensesRouter);
app.use('/api/losses', requireAuth, lossesRouter);
app.use('/api/dashboard', requireAuth, dashboardRouter);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;

async function start() {
  await ensureSchema();
  if (process.env.SEED_DEMO_DATA === 'true') await seed();
  await bootstrapAdmin();
  app.listen(PORT, () => console.log(`Lending Collection backend listening on http://localhost:${PORT}`));
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
