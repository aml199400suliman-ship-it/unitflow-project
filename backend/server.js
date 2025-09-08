// --- server.js (PostgreSQL / Neon) ---
require('dotenv').config();
const express = require('express');
const path = require('path');
const { neon } = require('@neondatabase/serverless');
const bcrypt = require('bcrypt');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// --- اتصال Neon PostgreSQL ---
if (!process.env.DATABASE_URL) {
    console.warn('DATABASE_URL is not set. Please configure it in your environment.');
}
const sql = neon(process.env.DATABASE_URL || '');

// تقديم ملفات الواجهة من مجلد frontend عند النشر على Render
const frontendDir = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendDir));

// نقطة فحص صحية
app.get('/healthz', async (req, res) => {
    try {
        const v = await sql`SELECT now() as now`;
        res.json({ status: 'ok', time: v[0]?.now });
    } catch (e) {
        res.status(500).json({ status: 'error', error: e.message });
    }
});

// وسيط يضيف sql للطلب
const withDB = async (req, res, next) => {
    try {
        req.sql = sql;
        next();
    } catch (error) {
        console.error('❌ Database Client Error:', error);
        res.status(500).json({ message: 'Database client initialization failed.' });
    }
};

// --- مسارات API ---

// المسار الرئيسي
app.get('/api', (req, res) => {
    res.json({ message: 'Welcome to UnitFlow API v2.0!' });
});

// ## مسار تسجيل الدخول ##
app.post('/api/login', withDB, async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required' });
    }

    try {
        const results = await req.sql`SELECT * FROM employees WHERE username = ${username}`;

        if (results.length === 0) {
            return res.status(401).json({ message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }

        const user = results[0];
        let isPasswordMatch = false;

        // دعم كلمات المرور النصية أو المشفرة
        if (user.password === password) {
            isPasswordMatch = true;
        } else {
            try {
                isPasswordMatch = await bcrypt.compare(password, user.password);
            } catch (e) {
                isPasswordMatch = false;
            }
        }

        if (isPasswordMatch) {
            const userPayload = { id: user.id, name: user.name, username: user.username, department: user.department, work_page: user.work_page };
            res.status(200).json(userPayload);
        } else {
            res.status(401).json({ message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }
    } catch (err) {
        console.error("Login Error:", err);
        res.status(500).json({ message: 'An internal server error occurred' });
    }
});

// --- إعداد المستخدمين الافتراضيين (مع كلمات مرور مشفرة) ---
app.post('/api/setup-users', withDB, async (req, res) => {
    try {
        // إنشاء الجداول إذا لم تكن موجودة
        await req.sql`CREATE TABLE IF NOT EXISTS employees (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            username VARCHAR(255) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            department VARCHAR(100) NOT NULL,
            work_page VARCHAR(255)
        )`;

        await req.sql`CREATE TABLE IF NOT EXISTS units (
            id VARCHAR(50) PRIMARY KEY,
            type VARCHAR(50) NOT NULL,
            current_department VARCHAR(100) NOT NULL,
            current_section VARCHAR(100) NOT NULL,
            last_movement_time TIMESTAMP DEFAULT NOW()
        )`;

        await req.sql`CREATE TABLE IF NOT EXISTS movements (
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
        )`;

        // حذف وإعادة إدخال المستخدمين الافتراضيين
        await req.sql`DELETE FROM employees WHERE username IN ('admin','azam','sufyan')`;

        const hashedAdmin = await bcrypt.hash('admin123', 10);
        const hashedAzam = await bcrypt.hash('azam123', 10);
        const hashedSufyan = await bcrypt.hash('suf123', 10);

        await req.sql`INSERT INTO employees (name, username, password, department, work_page)
                      VALUES ('مدير النظام','admin',${hashedAdmin},'management','admin.html'),
                             ('عزام','azam',${hashedAzam},'operations','operations.html'),
                             ('سفيان','sufyan',${hashedSufyan},'technical','technical.html')`;

        res.json({ message: '✅ تم إعداد المستخدمين الافتراضيين (بكلمات مرور مشفّرة) بنجاح' });
    } catch (err) {
        console.error('Setup users error:', err);
        res.status(500).json({ error: 'فشل إعداد المستخدمين', details: err.message });
    }
});

// --- CRUD: الوحدات (Units) ---
app.get('/api/units', withDB, async (req, res) => {
    try {
        const units = await req.sql`SELECT * FROM units ORDER BY last_movement_time DESC`;
        res.json(units);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/units', withDB, async (req, res) => {
    const { id, type } = req.body;
    try {
        await req.sql`INSERT INTO units (id, type, current_department, current_section, last_movement_time)
                      VALUES (${id}, ${type}, 'operations', 'ready_for_loading', NOW())`;
        res.status(201).json({ message: 'تمت إضافة الوحدة بنجاح' });
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ message: 'رقم الوحدة مستخدم بالفعل.' });
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/units/:id', withDB, async (req, res) => {
    const { type } = req.body;
    try {
        await req.sql`UPDATE units SET type = ${type} WHERE id = ${req.params.id}`;
        res.json({ message: 'تم تحديث الوحدة بنجاح' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/units/:id', withDB, async (req, res) => {
    try {
        await req.sql`DELETE FROM units WHERE id = ${req.params.id}`;
        res.json({ message: 'تم حذف الوحدة بنجاح' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- CRUD: الموظفون (Employees) ---
app.get('/api/employees', withDB, async (req, res) => {
    try {
        const employees = await req.sql`SELECT id, name, username, department, work_page FROM employees`;
        res.json(employees);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/employees', withDB, async (req, res) => {
    const { name, username, password, department, work_page } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await req.sql`INSERT INTO employees (name, username, password, department, work_page)
                      VALUES (${name}, ${username}, ${hashedPassword}, ${department}, ${work_page})`;
        res.status(201).json({ message: 'تمت إضافة الموظف بنجاح' });
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ message: 'اسم المستخدم موجود بالفعل.' });
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/employees/:id', withDB, async (req, res) => {
    const { name, username, department, work_page, password } = req.body;
    try {
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            await req.sql`UPDATE employees
                          SET name = ${name}, username = ${username}, department = ${department}, work_page = ${work_page}, password = ${hashedPassword}
                          WHERE id = ${req.params.id}`;
        } else {
            await req.sql`UPDATE employees
                          SET name = ${name}, username = ${username}, department = ${department}, work_page = ${work_page}
                          WHERE id = ${req.params.id}`;
        }
        res.json({ message: 'تم تحديث الموظف بنجاح' });
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ message: 'اسم المستخدم موجود بالفعل.' });
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/employees/:id', withDB, async (req, res) => {
    if (req.params.id === '1') {
        return res.status(403).json({ message: 'لا يمكن حذف المدير الرئيسي.' });
    }
    try {
        await req.sql`DELETE FROM employees WHERE id = ${req.params.id}`;
        res.json({ message: 'تم حذف الموظف بنجاح' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- الحركات والتقارير (Movements & Reports) ---
app.put('/api/units/:id/move', withDB, async (req, res) => {
    const { targetDepartment, targetSection, employeeId, movementType, notes } = req.body;
    const unitId = req.params.id;

    try {
        const units = await req.sql`SELECT * FROM units WHERE id = ${unitId}`;
        if (units.length === 0) return res.status(404).json({ message: 'Unit not found' });
        const oldUnit = units[0];

        await req.sql`UPDATE units SET current_department = ${targetDepartment}, current_section = ${targetSection}, last_movement_time = NOW() WHERE id = ${unitId}`;

        await req.sql`INSERT INTO movements
                       (unit_id, employee_id, movement_type, from_department, to_department, from_section, to_section, notes, timestamp)
                       VALUES (${unitId}, ${employeeId}, ${movementType}, ${oldUnit.current_department}, ${targetDepartment}, ${oldUnit.current_section}, ${targetSection}, ${notes || ''}, NOW())`;

        res.json({ message: 'تم نقل الوحدة بنجاح' });
    } catch (err) {
        console.error("Movement Error:", err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/movements', withDB, async (req, res) => {
    try {
        let whereParts = [];
        if (req.query.unitId) { whereParts.push(sql`m.unit_id = ${req.query.unitId}`); }
        if (req.query.employeeId) { whereParts.push(sql`m.employee_id = ${req.query.employeeId}`); }
        if (req.query.dateFrom) { whereParts.push(sql`m.timestamp >= ${req.query.dateFrom}`); }
        if (req.query.dateTo) { whereParts.push(sql`m.timestamp <= ${req.query.dateTo + ' 23:59:59'}`); }

        let base = sql`SELECT m.*, e.name as employee_name
                       FROM movements m
                       JOIN employees e ON m.employee_id = e.id`;
        if (whereParts.length > 0) {
            base = sql`${base} WHERE ${sql.join(whereParts, sql` AND `)}`;
        }
        const movements = await sql`${base} ORDER BY m.timestamp DESC`;
        res.json(movements);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- مسار الإحصائيات (Dashboard Stats) ---
app.get('/api/stats', withDB, async (req, res) => {
    try {
        const totalUnitsRow = await req.sql`SELECT COUNT(*)::int as count FROM units`;
        const unitsInOpsRow = await req.sql`SELECT COUNT(*)::int as count FROM units WHERE current_department = 'operations'`;
        const unitsInTechRow = await req.sql`SELECT COUNT(*)::int as count FROM units WHERE current_department = 'technical'`;
        const totalEmployeesRow = await req.sql`SELECT COUNT(*)::int as count FROM employees`;

        res.json({
            totalUnits: totalUnitsRow[0].count,
            unitsInOps: unitsInOpsRow[0].count,
            unitsInTech: unitsInTechRow[0].count,
            totalEmployees: totalEmployeesRow[0].count
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- تشغيل الخادم ---
app.listen(PORT, () => {
    console.log(`🚀 UnitFlow Backend is running on http://localhost:${PORT}`);
});

// إعادة توجيه أي مسار غير API لملفات الواجهة (index.html)
app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(frontendDir, 'index.html'));
});
