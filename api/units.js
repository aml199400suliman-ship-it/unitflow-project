const { sql } = require('./_db');

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const rows = await sql`SELECT * FROM units ORDER BY last_movement_time DESC`;
      res.json(rows);
      return;
    }

    if (req.method === 'POST') {
      const { id, type } = req.body || {};
      if (!id || !type) {
        res.status(400).json({ message: 'id and type are required' });
        return;
      }
      await sql`INSERT INTO units (id, type, current_department, current_section, last_movement_time)
                VALUES (${id}, ${type}, 'operations', 'ready_for_loading', NOW())`;
      res.status(201).json({ message: 'تمت إضافة الوحدة بنجاح' });
      return;
    }

    if (req.method === 'PUT') {
      const { id, type } = req.body || {};
      if (!id || !type) {
        res.status(400).json({ message: 'id and type are required' });
        return;
      }
      await sql`UPDATE units SET type = ${type} WHERE id = ${id}`;
      res.json({ message: 'تم تحديث الوحدة بنجاح' });
      return;
    }

    if (req.method === 'DELETE') {
      const id = req.query.id;
      if (!id) { res.status(400).json({ message: 'id is required' }); return; }
      await sql`DELETE FROM units WHERE id = ${id}`;
      res.json({ message: 'تم حذف الوحدة بنجاح' });
      return;
    }

    res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    console.error('Units API error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}


