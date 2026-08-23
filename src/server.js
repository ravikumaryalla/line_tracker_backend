const express = require('express');
const cors = require('cors');
const { ensureSchema } = require('./db/schema');
const seed = require('./db/seed');

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
app.use('/api/agents', agentsRouter);
app.use('/api/villages', villagesRouter);
app.use('/api/customers', customersRouter);
app.use('/api/expenses', expensesRouter);
app.use('/api/losses', lossesRouter);
app.use('/api/dashboard', dashboardRouter);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;

async function start() {
  await ensureSchema();
  await seed();
  app.listen(PORT, () => console.log(`Lending Collection backend listening on http://localhost:${PORT}`));
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
