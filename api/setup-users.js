// مسار إعداد سريع لإضافة مستخدمين افتراضيين عند الحاجة (لبيئة Render)
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

        // حذف المستخدمين الافتراضيين إن وجدوا
        await req.sql`DELETE FROM employees WHERE username IN ('admin','azam','sufyan')`;

        // تشفير كلمات المرور
        const hashedAdmin = await bcrypt.hash('admin123', 10);
        const hashedAzam = await bcrypt.hash('azam123', 10);
        const hashedSufyan = await bcrypt.hash('suf123', 10);

        // إدخال المستخدمين الافتراضيين
        await req.sql`INSERT INTO employees (name, username, password, department, work_page)
                      VALUES ('مدير النظام','admin',${hashedAdmin},'management','admin.html'),
                             ('عزام','azam',${hashedAzam},'operations','operations.html'),
                             ('سفيان','sufyan',${hashedSufyan},'technical','technical.html')`;

        res.json({ message: '✅ تم إعداد المستخدمين الافتراضيين (بكلمات مرور مشفّرة) بنجاح' });
    } catch (err) {
        console.error('❌ Setup users error:', err);
        res.status(500).json({ error: 'فشل إعداد المستخدمين', details: err.message });
    }
});
