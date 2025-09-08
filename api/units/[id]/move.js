const { sql } = require('../../_db');

module.exports = async function handler(req, res) {
  if (req.method !== 'PUT') { res.status(405).json({ error: 'Method Not Allowed' }); return; }
  try {
    const { id } = req.query;
    const { targetDepartment, targetSection, employeeId, movementType, notes } = req.body || {};
    if (!id || !targetDepartment || !targetSection || !employeeId || !movementType) {
      res.status(400).json({ message: 'Required fields are missing' });
      return;
    }
    const units = await sql`SELECT * FROM units WHERE id = ${id}`;
    if (units.length === 0) { res.status(404).json({ message: 'Unit not found' }); return; }
    const oldUnit = units[0];
    await sql`UPDATE units SET current_department = ${targetDepartment}, current_section = ${targetSection}, last_movement_time = NOW() WHERE id = ${id}`;
    await sql`INSERT INTO movements (unit_id, employee_id, movement_type, from_department, to_department, from_section, to_section, notes, timestamp)
              VALUES (${id}, ${employeeId}, ${movementType}, ${oldUnit.current_department}, ${targetDepartment}, ${oldUnit.current_section}, ${targetSection}, ${notes || ''}, NOW())`;
    res.json({ message: 'تم نقل الوحدة بنجاح' });
  } catch (err) {
    console.error('Move unit API error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}


