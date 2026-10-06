// Money paid on the current loan is the sum of its payment rows: a week can be paid above the weekly amount.
async function paidFor(pool, c) {
  const row = await pool.query('SELECT COALESCE(SUM(amount), 0) s FROM payments WHERE customer_id = $1 AND loan_no = $2', [c.id, c.loan_no]);
  return Number(row.rows[0].s);
}

// customer_id → total paid on the current loan, for summaries over many customers.
async function paidTotals(pool) {
  const { rows } = await pool.query(
    `SELECT p.customer_id, SUM(p.amount) s FROM payments p
     JOIN customers c ON c.id = p.customer_id AND c.loan_no = p.loan_no
     GROUP BY p.customer_id`
  );
  return new Map(rows.map((r) => [r.customer_id, Number(r.s)]));
}

// customer_id → { given, toCollect, paid } summed over the customer's earlier, closed loans.
async function pastTotals(pool) {
  const { rows } = await pool.query(
    `SELECT customer_id, SUM(given_amount) given, SUM(total_weeks * weekly_amount) to_collect, SUM(paid) paid
     FROM past_loans GROUP BY customer_id`
  );
  return new Map(rows.map((r) => [r.customer_id, { given: Number(r.given), toCollect: Number(r.to_collect), paid: Number(r.paid) }]));
}

// Weeks left once extra payments are counted: money paid above the weekly amount shortens the loan
// from the end. The current week still needs weekly - currentPartial; the final week may need less than weekly.
// Returns the last week number and what that week needs.
function scheduleFor({ weeksPaid, weekly, remaining, currentPartial }) {
  const firstNeed = Math.max(0, weekly - currentPartial);
  if (remaining <= firstNeed) return { lastWeek: weeksPaid + 1, lastAmount: remaining };
  const rest = remaining - firstNeed;
  const more = Math.ceil(rest / weekly);
  return { lastWeek: weeksPaid + 1 + more, lastAmount: rest - (more - 1) * weekly };
}

async function serializeCustomer(pool, c) {
  const missed = JSON.parse(c.missed_weeks || '[]');
  const partial = JSON.parse(c.partial_weeks || '{}');
  const paid = await paidFor(pool, c);
  const total = c.total_weeks * c.weekly_amount;

  const paidTodayRow = await pool.query(
    "SELECT COALESCE(SUM(amount), 0) s FROM payments WHERE customer_id = $1 AND loan_no = $2 AND paid_on = CURRENT_DATE",
    [c.id, c.loan_no]
  );
  const paidToday = Number(paidTodayRow.rows[0].s);

  const lastWeekRow = await pool.query('SELECT MAX(week_number) w FROM payments WHERE customer_id = $1 AND loan_no = $2', [c.id, c.loan_no]);
  const lastPaidWeek = lastWeekRow.rows[0].w || 0;

  const remaining = Math.max(0, total - paid);
  const currentPartial = partial[c.weeks_paid + 1] || 0;
  const schedule = remaining > 0
    ? scheduleFor({ weeksPaid: c.weeks_paid, weekly: c.weekly_amount, remaining, currentPartial })
    : { lastWeek: lastPaidWeek || c.weeks_paid, lastAmount: 0 };

  const photoRow = await pool.query('SELECT 1 FROM customer_photos WHERE customer_id = $1', [c.id]);

  let villageName = null;
  if (c.village_id) {
    const v = await pool.query('SELECT name FROM villages WHERE id = $1', [c.village_id]);
    villageName = v.rows[0] ? v.rows[0].name : null;
  }

  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    address: c.address,
    nominee: c.nominee,
    hasPhoto: photoRow.rowCount > 0,
    village: villageName,
    villageId: c.village_id,
    given: c.given_amount,
    weekly: c.weekly_amount,
    totalWeeks: c.total_weeks,
    weeksPaid: c.weeks_paid,
    missedWeeks: missed,
    partialWeeks: partial,
    paid,
    total,
    remaining,
    isDone: paid >= total,
    paidToday,
    isPaidToday: paidToday > 0,
    currentWeek: c.weeks_paid + 1,
    // totalWeeks is the original term; scheduleWeeks is how many weeks the loan actually runs.
    scheduleWeeks: schedule.lastWeek,
    lastWeekAmount: schedule.lastAmount,
    dueNow: Math.min(Math.max(0, c.weekly_amount - currentPartial), remaining),
    lastPaidWeek,
    loanNo: c.loan_no,
    loanStartedAt: c.loan_started_at || c.created_at,
    createdAt: c.created_at
  };
}

// payments: [{ week_number, amount, date }] in the order they were made.
function serializeTimeline(customer, payments) {
  const byWeek = {};
  for (const p of payments) (byWeek[p.week_number] = byWeek[p.week_number] || []).push({ amount: p.amount, date: p.date });

  // A cleared loan has no further weeks to show. Stop at the last week that actually has a payment:
  // payments made under the old carry-forward logic advanced weeks_paid past the week they were recorded on.
  // A running loan stops at scheduleWeeks, which is shorter than the term when extra has been paid.
  const lastWeek = customer.isDone ? (customer.lastPaidWeek || customer.weeksPaid) : (customer.scheduleWeeks || customer.totalWeeks);
  const tl = [];
  for (let w = 1; w <= lastWeek; w++) {
    const weekPayments = byWeek[w] || [];
    const sum = weekPayments.reduce((s, p) => s + p.amount, 0);
    let status = 'upcoming';
    let amount = !customer.isDone && w === lastWeek && customer.lastWeekAmount ? customer.lastWeekAmount : customer.weekly;
    if (w <= customer.weeksPaid) { status = 'paid'; amount = sum || customer.weekly; }
    else if (sum > 0) { status = 'partial'; amount = sum; }
    else if (customer.missedWeeks.includes(w)) status = 'missed';
    else if (w === customer.currentWeek) status = 'pending';
    tl.push({ week: w, amount, status, payments: weekPayments });
  }
  return tl;
}

module.exports = { paidTotals, pastTotals, scheduleFor, serializeCustomer, serializeTimeline };
