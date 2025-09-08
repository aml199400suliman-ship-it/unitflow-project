const { sql } = require('./_db');

module.exports = async function handler(req, res) {
  try {
    const sections = [
      'ready_for_loading', 'under_loading', 'in_transit_loaded', 'under_unloading',
      'in_transit_empty', 'delivered', 'awaiting_maintenance', 'in_maintenance',
      'awaiting_spare_parts', 'maintenance_completed', 'awaiting_documents',
      'document_processing', 'document_completed', 'awaiting_refuel', 'refuel_in_progress', 'refuel_completed'
    ];

    const counts = {};
    const q = async (cond) => (await sql`SELECT COUNT(*)::int as count FROM units WHERE ${cond}`)[0].count;

    // عمليات
    counts.operations = {
      readyForLoading: await q(sql`current_section = 'ready_for_loading'`),
      underLoading: await q(sql`current_section = 'under_loading'`),
      inTransitLoaded: await q(sql`current_section = 'in_transit_loaded'`),
      underUnloading: await q(sql`current_section = 'under_unloading'`),
      inTransitEmpty: await q(sql`current_section = 'in_transit_empty'`),
      delivered: await q(sql`current_section = 'delivered'`)
    };

    // فني
    counts.technical = {
      awaitingMaintenance: await q(sql`current_section = 'awaiting_maintenance'`),
      inMaintenance: await q(sql`current_section = 'in_maintenance'`),
      awaitingSpareParts: await q(sql`current_section = 'awaiting_spare_parts'`),
      maintenanceCompleted: await q(sql`current_section = 'maintenance_completed'`)
    };

    // تجاري
    counts.commercial = {
      awaitingDocuments: await q(sql`current_section = 'awaiting_documents'`),
      documentProcessing: await q(sql`current_section = 'document_processing'`),
      documentCompleted: await q(sql`current_section = 'document_completed'`)
    };

    // وقود
    counts.fuel = {
      awaitingRefuel: await q(sql`current_section = 'awaiting_refuel'`),
      refuelInProgress: await q(sql`current_section = 'refuel_in_progress'`),
      refuelCompleted: await q(sql`current_section = 'refuel_completed'`)
    };

    // تفصيل أنواع الوحدات
    const unitTypeStats = {};
    for (const section of sections) {
      const rows = await sql`SELECT type, COUNT(*)::int as count FROM units WHERE current_section = ${section} GROUP BY type`;
      unitTypeStats[section] = {};
      for (const r of rows) unitTypeStats[section][r.type] = r.count;
    }

    res.json({
      ...counts,
      unitTypeStats
    });
  } catch (err) {
    console.error('Comprehensive Stats API error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}


