const bcrypt = require('bcrypt');
const { sql } = require('./_db');

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const rows = await sql`SELECT id, name, username, department, work_page FROM employees`;
      res.json(rows);
      return;
    }

    if (req.method === 'POST') {
      const { name, username, password, department, work_page } = req.body || {};
      if (!name || !username || !password || !department) {
        res.status(400).json({ message: 'Missing required fields' });
        return;
      }
      const hashed = await bcrypt.hash(password, 10);
      await sql`INSERT INTO employees (name, username, password, department, work_page)
                VALUES (${name}, ${username}, ${hashed}, ${department}, ${work_page || null})`;
      res.status(201).json({ message: 'تمت إضافة الموظف بنجاح' });
      return;
    }

    if (req.method === 'PUT') {
      const { id, name, username, department, work_page, password } = req.body || {};
      if (!id) { res.status(400).json({ message: 'id is required' }); return; }
      if (password) {
        const hashed = await bcrypt.hash(password, 10);
        await sql`UPDATE employees SET name = ${name}, username = ${username}, department = ${department}, work_page = ${work_page}, password = ${hashed} WHERE id = ${id}`;
      } else {
        await sql`UPDATE employees SET name = ${name}, username = ${username}, department = ${department}, work_page = ${work_page} WHERE id = ${id}`;
      }
      res.json({ message: 'تم تحديث الموظف بنجاح' });
      return;
    }

    if (req.method === 'DELETE') {
      const id = req.query.id;
      if (!id) { res.status(400).json({ message: 'id is required' }); return; }
      if (String(id) === '1') { res.status(403).json({ message: 'لا يمكن حذف المدير الرئيسي.' }); return; }
      await sql`DELETE FROM employees WHERE id = ${id}`;
      res.json({ message: 'تم حذف الموظف بنجاح' });
      return;
    }

    res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    console.error('Employees API error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}


