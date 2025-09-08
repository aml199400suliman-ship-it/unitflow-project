const bcrypt = require('bcrypt');
const { sql } = require('./_db');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    // إنشاء جدول الموظفين إذا لم يكن موجوداً
    await sql`
      CREATE TABLE IF NOT EXISTS employees (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        username VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        department VARCHAR(100) NOT NULL,
        work_page VARCHAR(255)
      )
    `;

    // إنشاء جدول الوحدات إذا لم يكن موجوداً
    await sql`
      CREATE TABLE IF NOT EXISTS units (
        id VARCHAR(50) PRIMARY KEY,
        type VARCHAR(50) NOT NULL,
        current_department VARCHAR(100) NOT NULL,
        current_section VARCHAR(100) NOT NULL,
        last_movement_time TIMESTAMP DEFAULT NOW()
      )
    `;

    // إنشاء جدول الحركات إذا لم يكن موجوداً
    await sql`
      CREATE TABLE IF NOT EXISTS movements (
        id SERIAL PRIMARY KEY,
        unit_id VARCHAR(50) NOT NULL,
        employee_id INTEGER NOT NULL,
        movement_type VARCHAR(100) NOT NULL,
        from_department VARCHAR(100) NOT NULL,
        to_department VARCHAR(100) NOT NULL,
        from_section VARCHAR(100) NOT NULL,
        to_section VARCHAR(100) NOT NULL,
        notes TEXT,
        timestamp TIMESTAMP DEFAULT NOW()
      )
    `;

    // حذف المستخدمين الموجودين أولاً
    await sql`DELETE FROM employees WHERE username IN ('admin', 'azam', 'sufyan')`;

    // إضافة المستخدمين الجدد
    const users = [
      {
        name: 'مدير النظام',
        username: 'admin',
        password: 'admin123', // نص عادي
        department: 'management',
        work_page: 'admin.html'
      },
      {
        name: 'عزام',
        username: 'azam',
        password: 'azam123', // نص عادي
        department: 'operations',
        work_page: 'operations.html'
      },
      {
        name: 'سفيان',
        username: 'sufyan',
        password: 'suf123', // نص عادي
        department: 'technical',
        work_page: 'technical.html'
      }
    ];

    for (const user of users) {
      await sql`
        INSERT INTO employees (name, username, password, department, work_page)
        VALUES (${user.name}, ${user.username}, ${user.password}, ${user.department}, ${user.work_page})
      `;
    }

    // إضافة بعض الوحدات للاختبار
    const units = [
      { id: 'T001', type: 'Tipper', department: 'operations', section: 'ready_for_loading' },
      { id: 'C001', type: 'Cargo', department: 'operations', section: 'under_loading' },
      { id: 'TK001', type: 'Tanker', department: 'technical', section: 'awaiting_maintenance' },
      { id: 'S001', type: 'Silo', department: 'commercial', section: 'awaiting_documents' }
    ];

    for (const unit of units) {
      await sql`
        INSERT INTO units (id, type, current_department, current_section, last_movement_time)
        VALUES (${unit.id}, ${unit.type}, ${unit.department}, ${unit.section}, NOW())
        ON CONFLICT (id) DO UPDATE SET
        type = EXCLUDED.type,
        current_department = EXCLUDED.current_department,
        current_section = EXCLUDED.current_section,
        last_movement_time = NOW()
      `;
    }

    res.json({ 
      message: 'تم إعداد قاعدة البيانات والمستخدمين بنجاح!',
      users: users.map(u => ({ username: u.username, department: u.department })),
      units: units.length
    });

  } catch (err) {
    console.error('Setup error:', err);
    res.status(500).json({ 
      error: 'خطأ في إعداد قاعدة البيانات',
      details: err.message 
    });
  }
}
