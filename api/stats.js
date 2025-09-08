const { sql } = require('./_db');

module.exports = async function handler(req, res) {
  try {
    const totalUnitsRow = await sql`SELECT COUNT(*)::int as count FROM units`;
    const unitsInOpsRow = await sql`SELECT COUNT(*)::int as count FROM units WHERE current_department = 'operations'`;
    const unitsInTechRow = await sql`SELECT COUNT(*)::int as count FROM units WHERE current_department = 'technical'`;
    const totalEmployeesRow = await sql`SELECT COUNT(*)::int as count FROM employees`;

    res.json({
      totalUnits: totalUnitsRow[0].count,
      unitsInOps: unitsInOpsRow[0].count,
      unitsInTech: unitsInTechRow[0].count,
      totalEmployees: totalEmployeesRow[0].count
    });
  } catch (err) {
    console.error('Stats API error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}


