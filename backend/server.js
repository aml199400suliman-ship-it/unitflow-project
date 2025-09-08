// --- backend/server.js (Neon + Render Ready) ---
require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcrypt');

const { neon, neonConfig } = require('@neondatabase/serverless');

// في Node 20 fetch متوفر، فقط نتأكد:
if (!globalThis.fetch) {
  throw new Error('Node 20+ مطلوب لتوفير fetch للسائق @neondatabase/serverless');
}

neonConfig.fetch = globalThis.fetch;

const app = express();
const PORT = process.env.PORT || 3000;

// ===== إعدادات أساسية
app.use(cors());
app.use(express.json());

// تقديم ملفات الواجهة من مجلد frontend
const frontendDir = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendDir));

// ===== اتصال Neon
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL غير مضبوط. رجاءً ضعه في متغيرات البيئة على Render.');
  process.exit(1);
}
const sql = neon(DATABASE_URL);

// ===== تهيئة قاعدة البيانات عند الإقلاع
async function initDb() {
  // جداول
  await sql`
    CREATE TABLE IF NOT EXISTS employees (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      username VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      department VARCHAR(100) NOT NULL,
      work_page VARCHAR(255)
    );
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS units (
      id VARCHAR(50) PRIMARY KEY,
      type VARCHAR(50) NOT NULL,
      current_department VARCHAR(100) NOT NULL,
      current_section VARCHAR(100) NOT NULL,
      last_movement_time TIMESTAMP DEFAULT NOW()
    );
  `;
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
    );
  `;

  // إنشاء مدير افتراضي عند عدم وجوده
  const admin = await sql`SELECT 1 FROM employees WHERE username = 'admin' LIMIT 1`;
  if (admin.length === 0) {
    const hashed = await bcrypt.hash('admin123', 10);
    await sql`
      INSERT INTO employees (name, username, password, department, work_page)
      VALUES ('مدير النظام','admin',${hashed},'management','admin.html')
      ON CONFLICT (username) DO NOTHING;
    `;
    console.log('✅ تم إنشاء حساب admin / admin123');
  }
}

initDb().then(() => {
  console.log('✅ DB ready');
}).catch((e) => {
  console.error('❌ DB init failed:', e);
  // لا نُنهي العملية كي لا ندخل في لوب إعادة التشغيل، لكن نظهر سبب الفشل بوضوح
});

// ===== مسارات فحص صحيّة
app.get('/healthz', async (req, res) => {
  try {
    const r = await sql`SELECT now() AS now`;
    res.json({ status: 'ok', time: r[0].now });
  } catch (e) {
    res.status(500).json({ status: 'error', error: e.message });
  }
});

// وسيط يمرر sql للطلبات
const withDB = (req, res, next) => { req.sql = sql; next(); };

// ===== API
app.get('/api', (req, res) => {
  res.json({ message: 'Welcome to UnitFlow API v2.1!' });
});

// تسجيل الدخول
app.post('/api/login', withDB, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ message: 'Username and password are required' });

  try {
    const rows = await req.sql`SELECT * FROM employees WHERE username = ${username}`;
    if (rows.length === 0) return res.status(401).json({ message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });

    const user = rows[0];

    // ندعم كلمـات مرور قديمة نصّية + المُشفّرة
    const match = (user.password === password) || await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });

    const payload = {
      id: user.id,
      name: user.name,
      username: user.username,
      department: user.department,
      work_page: user.work_page
    };
    res.json(payload);
  } catch (e) {
    console.error('Login Error:', e);
    res.status(500).json({ message: 'An internal server error occurred' });
  }
});

// تهيئة / تلقيم سريع (آمن: UPSERT + تشفير)
app.post('/api/setup-users', withDB, async (req, res) => {
  try {
    await initDb();
    const defs = [
      ['مدير النظام','admin','admin123','management','admin.html'],
      ['عزام','azam','azam123','operations','operations.html'],
      ['سفيان','sufyan','suf123','technical','technical.html'],
    ];
    for (const [name, username, pass, dept, page] of defs) {
      const hashed = await bcrypt.hash(pass, 10);
      await req.sql`
        INSERT INTO employees (name, username, password, department, work_page)
        VALUES (${name}, ${username}, ${hashed}, ${dept}, ${page})
        ON CONFLICT (username) DO UPDATE SET
          name = EXCLUDED.name,
          department = EXCLUDED.department,
          work_page = EXCLUDED.work_page;
      `;
    }
    res.json({ message: 'تم إعداد/تحديث المستخدمين الافتراضيين بنجاح' });
  } catch (e) {
    console.error('Setup users error:', e);
    res.status(500).json({ error: 'فشل إعداد المستخدمين', details: e.message });
  }
});

// Units
app.get('/api/units', withDB, async (req, res) => {
  try {
    const units = await req.sql`SELECT * FROM units ORDER BY last_movement_time DESC`;
    res.json(units);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/units', withDB, async (req, res) => {
  const { id, type } = req.body || {};
  if (!id || !type) return res.status(400).json({ message: 'id & type مطلوبة' });
  try {
    await req.sql`
      INSERT INTO units (id, type, current_department, current_section, last_movement_time)
      VALUES (${id}, ${type}, 'operations', 'ready_for_loading', NOW())
    `;
    res.status(201).json({ message: 'تمت إضافة الوحدة بنجاح' });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ message: 'رقم الوحدة مستخدم بالفعل.' });
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/units/:id', withDB, async (req, res) => {
  const { type } = req.body || {};
  try {
    await req.sql`UPDATE units SET type = ${type} WHERE id = ${req.params.id}`;
    res.json({ message: 'تم تحديث الوحدة بنجاح' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/units/:id', withDB, async (req, res) => {
  try {
    await req.sql`DELETE FROM units WHERE id = ${req.params.id}`;
    res.json({ message: 'تم حذف الوحدة بنجاح' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Employees
app.get('/api/employees', withDB, async (req, res) => {
  try {
    const employees = await req.sql`SELECT id, name, username, department, work_page FROM employees`;
    res.json(employees);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/employees', withDB, async (req, res) => {
  const { name, username, password, department, work_page } = req.body || {};
  if (!name || !username || !password || !department) return res.status(400).json({ message: 'حقول مطلوبة مفقودة' });
  try {
    const hashed = await bcrypt.hash(password, 10);
    await req.sql`
      INSERT INTO employees (name, username, password, department, work_page)
      VALUES (${name}, ${username}, ${hashed}, ${department}, ${work_page})
    `;
    res.status(201).json({ message: 'تمت إضافة الموظف بنجاح' });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ message: 'اسم المستخدم موجود بالفعل.' });
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/employees/:id', withDB, async (req, res) => {
  const { name, username, department, work_page, password } = req.body || {};
  try {
    if (password) {
      const hashed = await bcrypt.hash(password, 10);
      await req.sql`
        UPDATE employees
        SET name = ${name}, username = ${username}, department = ${department}, work_page = ${work_page}, password = ${hashed}
        WHERE id = ${req.params.id}
      `;
    } else {
      await req.sql`
        UPDATE employees
        SET name = ${name}, username = ${username}, department = ${department}, work_page = ${work_page}
        WHERE id = ${req.params.id}
      `;
    }
    res.json({ message: 'تم تحديث الموظف بنجاح' });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ message: 'اسم المستخدم موجود بالفعل.' });
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/employees/:id', withDB, async (req, res) => {
  if (req.params.id === '1') return res.status(403).json({ message: 'لا يمكن حذف المدير الرئيسي.' });
  try {
    await req.sql`DELETE FROM employees WHERE id = ${req.params.id}`;
    res.json({ message: 'تم حذف الموظف بنجاح' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Movements
app.put('/api/units/:id/move', withDB, async (req, res) => {
  const { targetDepartment, targetSection, employeeId, movementType, notes } = req.body || {};
  const unitId = req.params.id;

  try {
    const rows = await req.sql`SELECT * FROM units WHERE id = ${unitId}`;
    if (rows.length === 0) return res.status(404).json({ message: 'Unit not found' });
    const oldUnit = rows[0];

    await req.sql`
      UPDATE units
      SET current_department = ${targetDepartment},
          current_section = ${targetSection},
          last_movement_time = NOW()
      WHERE id = ${unitId}
    `;

    await req.sql`
      INSERT INTO movements
      (unit_id, employee_id, movement_type, from_department, to_department, from_section, to_section, notes, timestamp)
      VALUES (${unitId}, ${employeeId}, ${movementType}, ${oldUnit.current_department}, ${targetDepartment}, ${oldUnit.current_section}, ${targetSection}, ${notes || ''}, NOW())
    `;

    res.json({ message: 'تم نقل الوحدة بنجاح' });
  } catch (e) {
    console.error('Movement Error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/movements', withDB, async (req, res) => {
  try {
    const where = [];
    if (req.query.unitId) where.push(sql`m.unit_id = ${req.query.unitId}`);
    if (req.query.employeeId) where.push(sql`m.employee_id = ${req.query.employeeId}`);
    if (req.query.dateFrom) where.push(sql`m.timestamp >= ${req.query.dateFrom}`);
    if (req.query.dateTo) where.push(sql`m.timestamp <= ${req.query.dateTo + ' 23:59:59'}`);

    let q = sql`SELECT m.*, e.name as employee_name FROM movements m JOIN employees e ON m.employee_id = e.id`;
    if (where.length) q = sql`${q} WHERE ${sql.join(where, sql` AND `)}`;
    const rows = await sql`${q} ORDER BY m.timestamp DESC`;
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// إعادة توجيه أي مسار غير API لملفات الواجهة (SPA)
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

// تشغيل الخادم
app.listen(PORT, () => {
  console.log(`🚀 UnitFlow Backend running on port ${PORT}`);
});
