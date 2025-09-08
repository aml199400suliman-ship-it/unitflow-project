const { sql } = require('./_db');

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      let whereParts = [];
      if (req.query.unitId) whereParts.push(sql`m.unit_id = ${req.query.unitId}`);
      if (req.query.employeeId) whereParts.push(sql`m.employee_id = ${req.query.employeeId}`);
      if (req.query.dateFrom) whereParts.push(sql`m.timestamp >= ${req.query.dateFrom}`);
      if (req.query.dateTo) whereParts.push(sql`m.timestamp <= ${req.query.dateTo + ' 23:59:59'}`);

      let base = sql`SELECT m.*, e.name as employee_name
                     FROM movements m
                     JOIN employees e ON m.employee_id = e.id`;
      if (whereParts.length) base = sql`${base} WHERE ${sql.join(whereParts, sql` AND `)}`;
      const rows = await sql`${base} ORDER BY m.timestamp DESC`;
      res.json(rows);
      return;
    }

    if (req.method === 'PUT') {
      const { id, targetDepartment, targetSection, employeeId, movementType, notes } = req.body || {};
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
      return;
    }

    res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    console.error('Movements API error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}


