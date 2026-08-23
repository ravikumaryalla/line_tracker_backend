const db = require('./schema');

const AGENTS = [
  { name: 'Mani Selvam', phone: '90000 00001', active: 1 },
  { name: 'Ashok Kumar', phone: '90000 00002', active: 1 },
  { name: 'Rekha Devi', phone: '90000 00003', active: 1 },
  { name: 'Vijay Anand', phone: '90000 00004', active: 0 }
];

const VILLAGES = [
  { name: 'Kollur', agent: 'Mani Selvam' },
  { name: 'Ammapet', agent: 'Mani Selvam' },
  { name: 'Vadugapatti', agent: 'Ashok Kumar' },
  { name: 'Sathur', agent: 'Rekha Devi' },
  { name: 'Periyakulam', agent: 'Vijay Anand' }
];

// [name, phone, village, address, given, weekly, weeks, done, missed[], partial{}]
const CUSTOMERS = [
  ['Ravi Kumar', '98765 43210', 'Kollur', 'Near Perumal temple', 10000, 1000, 12, 3, [], {}],
  ['Suresh Babu', '98431 22110', 'Kollur', 'Bus stand road', 15000, 1000, 18, 7, [], {}],
  ['Kumar Raja', '90876 55412', 'Ammapet', 'Mill quarters, block 2', 5000, 500, 12, 5, [], { 4: 300 }],
  ['Lakshmi Devi', '99442 87611', 'Kollur', 'Behind school', 18000, 1500, 14, 6, [], {}],
  ['Murugan S', '94422 10098', 'Vadugapatti', 'Kanni street', 12000, 1000, 15, 4, [3], {}],
  ['Devi Priya', '90031 44521', 'Ammapet', 'Near ration shop', 9000, 750, 14, 9, [], {}],
  ['Anand Raj', '87654 33221', 'Vadugapatti', 'Pump house road', 10000, 1000, 12, 2, [], {}],
  ['Selvi M', '96770 12345', 'Kollur', 'Market street', 15000, 1250, 14, 8, [], {}],
  ['Ganesh K', '95001 78453', 'Ammapet', 'Old post office', 5000, 500, 12, 10, [], {}],
  ['Priya Ram', '93450 66723', 'Kollur', 'Water tank street', 10000, 1000, 12, 5, [], {}],
  ['Mani Vel', '94433 90876', 'Vadugapatti', 'Near mosque', 18000, 1500, 14, 3, [2], {}],
  ['Vani Sri', '98800 45312', 'Sathur', 'Colony 3rd cross', 10000, 1000, 12, 6, [], {}]
];

const EXPENSES = [
  ['Mani Selvam', 'Fuel', 220, '23 Aug', 'Bike petrol'],
  ['Mani Selvam', 'Food', 90, '22 Aug', 'Tea and lunch'],
  ['Mani Selvam', 'Travel', 140, '21 Aug', 'Bus to Vadugapatti'],
  ['Mani Selvam', 'Other', 60, '20 Aug', 'Notebook']
];

const LOSSES = [
  ['Ravi Chandran', 'Ammapet', 'Mani Selvam', 5000, 2000, 'Customer stopped paying, left the village'],
  ['Bala Murugan', 'Vadugapatti', 'Ashok Kumar', 4500, 1500, 'Shop closed down'],
  ['Sundari K', 'Sathur', 'Rekha Devi', 3000, 1000, 'Family moved to Chennai']
];

function seed() {
  const already = db.prepare('SELECT COUNT(*) c FROM agents').get().c;
  if (already > 0) {
    console.log('Database already seeded, skipping.');
    return;
  }

  const insertAgent = db.prepare('INSERT INTO agents (name, phone, active) VALUES (?, ?, ?)');
  const agentIds = {};
  for (const a of AGENTS) {
    const info = insertAgent.run(a.name, a.phone, a.active);
    agentIds[a.name] = info.lastInsertRowid;
  }

  const insertVillage = db.prepare('INSERT INTO villages (name, agent_id) VALUES (?, ?)');
  const villageIds = {};
  for (const v of VILLAGES) {
    const info = insertVillage.run(v.name, agentIds[v.agent]);
    villageIds[v.name] = info.lastInsertRowid;
  }

  const insertCustomer = db.prepare(`
    INSERT INTO customers (name, phone, address, village_id, agent_id, given_amount, weekly_amount, total_weeks, weeks_paid, missed_weeks, partial_weeks)
    VALUES (@name, @phone, @address, @village_id, @agent_id, @given, @weekly, @weeks, @done, @missed, @partial)
  `);
  const custIds = {};
  for (const [name, phone, village, address, given, weekly, weeks, done, missed, partial] of CUSTOMERS) {
    const villageAgentId = db.prepare('SELECT agent_id FROM villages WHERE id = ?').get(villageIds[village]).agent_id;
    const info = insertCustomer.run({
      name, phone, address, village_id: villageIds[village], agent_id: villageAgentId,
      given, weekly, weeks, done, missed: JSON.stringify(missed), partial: JSON.stringify(partial)
    });
    custIds[name] = info.lastInsertRowid;
  }

  // Simulate today's collections already made by the lead agent, matching the mock's paidToday state.
  const paidTodayNames = ['Ravi Kumar', 'Suresh Babu', 'Lakshmi Devi', 'Devi Priya', 'Anand Raj', 'Selvi M', 'Ganesh K', 'Priya Ram'];
  const insertPayment = db.prepare('INSERT INTO payments (customer_id, week_number, amount, note, paid_on) VALUES (?, ?, ?, ?, date(\'now\'))');
  for (const name of paidTodayNames) {
    const c = db.prepare('SELECT * FROM customers WHERE id = ?').get(custIds[name]);
    insertPayment.run(c.id, c.weeks_paid + 1, c.weekly_amount, null);
    db.prepare('UPDATE customers SET weeks_paid = weeks_paid + 1 WHERE id = ?').run(c.id);
  }

  const insertExpense = db.prepare('INSERT INTO expenses (agent_id, category, amount, note, expense_date) VALUES (?, ?, ?, ?, ?)');
  for (const [agent, cat, amt, date, note] of EXPENSES) {
    insertExpense.run(agentIds[agent], cat, amt, note, date);
  }

  const insertLoss = db.prepare('INSERT INTO losses (customer_name, village, agent_name, remaining, recovered, reason) VALUES (?, ?, ?, ?, ?, ?)');
  for (const [name, village, agent, remaining, recovered, reason] of LOSSES) {
    insertLoss.run(name, village, agent, remaining, recovered, reason);
  }

  console.log('Seed complete.');
}

seed();
