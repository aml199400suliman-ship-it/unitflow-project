const { sql } = require('./_db');

module.exports = async function handler(req, res) {
  try {
    // اختبار الاتصال بقاعدة البيانات
    const result = await sql`SELECT version() as db_version`;
    
    // فحص وجود الجداول
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `;
    
    // فحص المستخدمين
    let users = [];
    try {
      users = await sql`SELECT username, department FROM employees LIMIT 5`;
    } catch (e) {
      console.log('Employees table not found or empty');
    }
    
    // فحص الوحدات
    let units = [];
    try {
      units = await sql`SELECT id, type, current_department FROM units LIMIT 5`;
    } catch (e) {
      console.log('Units table not found or empty');
    }

    res.json({
      status: 'success',
      database: {
        version: result[0]?.db_version || 'Unknown',
        tables: tables.map(t => t.table_name),
        users_count: users.length,
        units_count: units.length
      },
      users: users,
      units: units,
      message: 'قاعدة البيانات تعمل بشكل صحيح'
    });

  } catch (err) {
    console.error('Database check error:', err);
    res.status(500).json({
      status: 'error',
      error: 'خطأ في الاتصال بقاعدة البيانات',
      details: err.message
    });
  }
}
