const bcrypt = require('bcrypt');
const { sql } = require('./_db');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      res.status(400).json({ message: 'Username and password are required' });
      return;
    }

    const users = await sql`SELECT * FROM employees WHERE username = ${username}`;
    if (users.length === 0) {
      res.status(401).json({ message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
      return;
    }

    const user = users[0];
    
    // مقارنة كلمة المرور (نص عادي أولاً، ثم bcrypt)
    let valid = false;
    
    // محاولة المقارنة المباشرة (نص عادي)
    if (user.password === password) {
      valid = true;
    } else {
      // محاولة المقارنة مع bcrypt
      try {
        valid = await bcrypt.compare(password, user.password);
      } catch (bcryptError) {
        console.log('Bcrypt comparison failed:', bcryptError.message);
        valid = false;
      }
    }

    if (!valid) {
      res.status(401).json({ message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
      return;
    }

    const payload = { id: user.id, name: user.name, username: user.username, department: user.department, work_page: user.work_page };
    res.json(payload);
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}


