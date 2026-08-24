async function serializeCustomer(pool, c) {
  const missed = JSON.parse(c.missed_weeks || '[]');
  const partial = JSON.parse(c.partial_weeks || '{}');
  const partialSum = Object.values(partial).reduce((a, b) => a + b, 0);
  const paid = c.weeks_paid * c.weekly_amount + partialSum;
  const total = c.total_weeks * c.weekly_amount;

  const paidTodayRow = await pool.query(
    "SELECT COALESCE(SUM(amount), 0) s FROM payments WHERE customer_id = $1 AND paid_on = CURRENT_DATE",
    [c.id]
  );
  const paidToday = Number(paidTodayRow.rows[0].s);

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
    village: villageName,
    villageId: c.village_id,
    agentId: c.agent_id,
    given: c.given_amount,
    weekly: c.weekly_amount,
    totalWeeks: c.total_weeks,
    weeksPaid: c.weeks_paid,
    missedWeeks: missed,
    partialWeeks: partial,
    paid,
    total,
    remaining: Math.max(0, total - paid),
    isDone: c.weeks_paid >= c.total_weeks,
    paidToday,
    isPaidToday: paidToday > 0,
    currentWeek: c.weeks_paid + 1,
    createdAt: c.created_at
  };
}

function serializeTimeline(customer) {
  const tl = [];
  for (let w = 1; w <= customer.totalWeeks; w++) {
    let status = 'upcoming';
    let amount = customer.weekly;
    if (customer.missedWeeks.includes(w)) status = 'missed';
    else if (customer.partialWeeks[w]) { status = 'partial'; amount = customer.partialWeeks[w]; }
    else if (w <= customer.weeksPaid) status = 'paid';
    else if (w === customer.currentWeek) status = customer.isPaidToday ? 'paid' : 'pending';
    tl.push({ week: w, amount, status });
  }
  return tl;
}

module.exports = { serializeCustomer, serializeTimeline };
