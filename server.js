import 'dotenv/config';
import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { readFile } from 'fs/promises';
import pg from 'pg';

const { Pool } = pg;
const __dirname = process.cwd();
const app = express();
const port = Number(process.env.PORT || 3000);

const appName = process.env.APP_NAME || 'AeroParty 2026';
const stepPrice = Number(process.env.STEP_PRICE_IDR || 100000);

const paymentInfo = {
  bank: 'BCA',
  accountNumber: '4372508161',
  accountHolder: 'Cita Amadhea'
};

if (!process.env.DATABASE_URL) {
  console.warn('DATABASE_URL belum diisi pada .env');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost')
    ? false
    : { rejectUnauthorized: false }
});

app.use(express.json({ limit: '7mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

function basicAuth(req, res, next) {
  const h = req.headers.authorization || '';

  if (!h.startsWith('Basic ')) {
    return res
      .status(401)
      .set('WWW-Authenticate', 'Basic realm="AeroParty Admin"')
      .json({ error: 'Silakan login admin.' });
  }

  const [u, p] = Buffer.from(h.slice(6), 'base64')
    .toString()
    .split(':');

  if (
    !safeEqual(u, process.env.ADMIN_USERNAME || 'admin') ||
    !safeEqual(p, process.env.ADMIN_PASSWORD || 'change-this-password')
  ) {
    return res
      .status(401)
      .set('WWW-Authenticate', 'Basic realm="AeroParty Admin"')
      .json({ error: 'Username atau password admin salah.' });
  }

  next();
}

async function initDb() {
  await pool.query(
    await readFile(path.join(__dirname, 'schema.sql'), 'utf8')
  );

  await pool.query(`
    ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS proof_file TEXT;

    ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS admin_note TEXT;
  `);

  await pool.query(`
    ALTER TABLE bookings
    DROP CONSTRAINT IF EXISTS bookings_status_check
  `);

  await pool.query(`
    ALTER TABLE bookings
    ADD CONSTRAINT bookings_status_check
    CHECK(status IN ('pending', 'paid', 'rejected', 'expired', 'cancelled'))
  `);

  await pool.query(`
    DELETE FROM classes
    WHERE slug = 'aerobik'
    AND NOT EXISTS (
      SELECT 1
      FROM bookings b
      WHERE b.class_id = classes.id
    )
  `);
}

// Konfigurasi website
app.get('/api/config', (req, res) => {
  res.json({
    appName,
    stepPrice,
    classes: ['pemula', 'middle'],
    paymentInfo
  });
});

// Daftar kelas
app.get('/api/classes', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        c.id,
        c.name,
        c.slug,
        c.description,
        COUNT(s.id)::int total,
        COUNT(*) FILTER (
          WHERE s.status = 'available'
        )::int available,
        COUNT(*) FILTER (
          WHERE s.status = 'pending'
        )::int pending,
        COUNT(*) FILTER (
          WHERE s.status = 'paid'
        )::int paid
      FROM classes c
      LEFT JOIN steps s ON s.class_id = c.id
      WHERE c.slug IN ('pemula', 'middle')
      GROUP BY c.id
      ORDER BY c.id
    `);

    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Gagal memuat daftar kelas.' });
  }
});

// Daftar nomor step
app.get('/api/classes/:slug/steps', async (req, res) => {
  try {
    if (!['pemula', 'middle'].includes(req.params.slug)) {
      return res.status(404).json({ error: 'Kelas tidak ditemukan.' });
    }

    const { rows } = await pool.query(`
      SELECT s.step_number, s.status
      FROM steps s
      JOIN classes c ON c.id = s.class_id
      WHERE c.slug = $1
      ORDER BY s.step_number
    `, [req.params.slug]);

    if (!rows.length) {
      return res.status(404).json({ error: 'Kelas tidak ditemukan.' });
    }

    res.json({
      classSlug: req.params.slug,
      steps: rows
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Gagal memuat nomor step.' });
  }
});

// Membuat booking
app.post('/api/bookings', async (req, res) => {
  const {
    classSlug,
    stepNumber,
    fullName,
    phone,
    email
  } = req.body || {};

  const checks = {
    classSlug,
    stepNumber,
    hasName: typeof fullName === 'string' && !!fullName.trim(),
    hasPhone: typeof phone === 'string' && !!phone.trim(),
    hasEmail: typeof email === 'string' && !!email.trim()
  };

  if (
    !['pemula', 'middle'].includes(classSlug) ||
    !Number.isInteger(Number(stepNumber)) ||
    Number(stepNumber) < 1 ||
    Number(stepNumber) > 50 ||
    !checks.hasName ||
    !checks.hasPhone ||
    !checks.hasEmail
  ) {
    return res.status(400).json({
      error: 'Pemeriksaan data booking gagal.',
      checks
    });
  }

  const c = await pool.connect();

  try {
    await c.query('BEGIN');

    const cls = (
      await c.query(
        'SELECT id, name FROM classes WHERE slug = $1',
        [classSlug]
      )
    ).rows[0];

    if (!cls) {
      throw Error('Kelas tidak ditemukan.');
    }

    const st = (
      await c.query(`
        SELECT id, status
        FROM steps
        WHERE class_id = $1
        AND step_number = $2
        FOR UPDATE
      `, [cls.id, Number(stepNumber)])
    ).rows[0];

    if (!st || st.status !== 'available') {
      throw Error('Nomor ini sudah dipesan. Pilih nomor lain.');
    }

    const order =
      `AP26-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    const b = (
      await c.query(`
        INSERT INTO bookings (
          order_id,
          class_id,
          step_id,
          full_name,
          phone,
          email,
          amount,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
        RETURNING *
      `, [
        order,
        cls.id,
        st.id,
        fullName.trim(),
        phone.trim(),
        email.trim().toLowerCase(),
        stepPrice
      ])
    ).rows[0];

    await c.query(
      `UPDATE steps SET status = 'pending' WHERE id = $1`,
      [st.id]
    );

    await c.query('COMMIT');

    res.json({
      orderId: order,
      className: cls.name,
      stepNumber: Number(stepNumber),
      amount: b.amount,
      status: 'pending',
      paymentInfo
    });
  } catch (e) {
    await c.query('ROLLBACK');
    console.error(e);
    res.status(409).json({ error: e.message });
  } finally {
    c.release();
  }
});

// Mengunggah bukti transfer
app.post('/api/bookings/:orderId/proof', async (req, res) => {
  try {
    const { data, mime } = req.body || {};

    if (
      !['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(mime) ||
      typeof data !== 'string' ||
      data.length > 6 * 1024 * 1024
    ) {
      return res.status(400).json({
        error: 'Unggah JPG, PNG, WEBP, atau PDF maksimal 4 MB.'
      });
    }

    const order = req.params.orderId.replace(/[^A-Za-z0-9-]/g, '');

    const ext = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'application/pdf': 'pdf'
    }[mime];

    const key = `${order}/${crypto.randomUUID()}.${ext}`;
    const buffer = Buffer.from(data, 'base64');

    if (buffer.length > 4 * 1024 * 1024) {
      return res.status(400).json({
        error: 'Ukuran file maksimal 4 MB.'
      });
    }

    const base = process.env.SUPABASE_URL;
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const bucket = process.env.SUPABASE_BUCKET || 'bukti-transfer';

    if (!base || !secret) {
      return res.status(500).json({
        error: 'Pengaturan Supabase Storage belum lengkap di Netlify.'
      });
    }

    const up = await fetch(
      `${base}/storage/v1/object/${encodeURIComponent(bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secret}`,
          apikey: secret,
          'Content-Type': mime,
          'x-upsert': 'false'
        },
        body: buffer
      }
    );

    if (!up.ok) {
      throw Error(
        'Gagal menyimpan bukti ke Supabase Storage. Periksa nama bucket dan pengaturan.'
      );
    }

    const result = await pool.query(`
      UPDATE bookings
      SET proof_file = $1
      WHERE order_id = $2
      AND status = 'pending'
      RETURNING order_id
    `, [key, order]);

    if (!result.rowCount) {
      await fetch(
        `${base}/storage/v1/object/${encodeURIComponent(bucket)}/${key}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${secret}`,
            apikey: secret
          }
        }
      );

      return res.status(404).json({
        error: 'Pemesanan tidak ditemukan atau sudah diproses.'
      });
    }

    res.json({
      ok: true,
      message: 'Bukti transfer berhasil dikirim.'
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: e.message || 'Gagal mengunggah bukti.'
    });
  }
});

// Melihat status booking
app.get('/api/bookings/:orderId', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        b.order_id,
        b.full_name,
        b.amount,
        b.status,
        b.created_at,
        b.admin_note,
        c.name class_name,
        s.step_number
      FROM bookings b
      JOIN classes c ON c.id = b.class_id
      JOIN steps s ON s.id = b.step_id
      WHERE b.order_id = $1
    `, [req.params.orderId]);

    if (!rows[0]) {
      return res.status(404).json({
        error: 'Booking tidak ditemukan.'
      });
    }

    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Gagal memuat status booking.' });
  }
});

// Dashboard admin: daftar booking
app.get('/api/admin/bookings', basicAuth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT
      b.order_id,
      b.full_name,
      b.phone,
      b.email,
      b.amount,
      b.status,
      b.created_at,
      b.proof_file IS NOT NULL has_proof,
      c.name class_name,
      s.step_number
    FROM bookings b
    JOIN classes c ON c.id = b.class_id
    JOIN steps s ON s.id = b.step_id
    WHERE c.slug IN ('pemula', 'middle')
    ORDER BY b.created_at DESC
    LIMIT 500
  `);

  res.json(rows);
});

// Membuka bukti transfer dari dashboard admin
app.get('/api/admin/proof/:orderId', basicAuth, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT proof_file FROM bookings WHERE order_id = $1',
      [req.params.orderId]
    );

    if (!r.rows[0]?.proof_file) {
      return res.status(404).send('Bukti belum tersedia');
    }

    const base = process.env.SUPABASE_URL;
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const bucket = process.env.SUPABASE_BUCKET || 'bukti-transfer';
    const key = r.rows[0].proof_file;

    const sr = await fetch(
      `${base}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secret}`,
          apikey: secret,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ expiresIn: 60 })
      }
    );

    if (!sr.ok) {
      return res.status(502).send(
        'Tidak dapat membuka bukti transfer.'
      );
    }

    const data = await sr.json();
    res.redirect(base + '/storage/v1' + data.signedURL);
  } catch (e) {
    console.error(e);
    res.status(500).send('Gagal membuka bukti.');
  }
});

// Admin menyetujui atau menolak booking
app.post('/api/admin/bookings/:orderId/:action', basicAuth, async (req, res) => {
  const action = req.params.action;

  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'Aksi tidak valid.' });
  }

  const c = await pool.connect();

  try {
    await c.query('BEGIN');

    const b = (
      await c.query(`
        SELECT *
        FROM bookings
        WHERE order_id = $1
        FOR UPDATE
      `, [req.params.orderId])
    ).rows[0];

    if (!b || b.status !== 'pending') {
      throw Error('Booking tidak ditemukan atau sudah diproses.');
    }

    if (action === 'approve') {
      if (!b.proof_file) {
        throw Error('Peserta belum mengunggah bukti transfer.');
      }

      await c.query(`
        UPDATE bookings
        SET status = 'paid', paid_at = NOW()
        WHERE id = $1
      `, [b.id]);

      await c.query(`
        UPDATE steps
        SET status = 'paid'
        WHERE id = $1
      `, [b.step_id]);
    } else {
      await c.query(`
        UPDATE bookings
        SET status = 'rejected',
            admin_note = 'Bukti ditolak admin'
        WHERE id = $1
      `, [b.id]);

      await c.query(`
        UPDATE steps
        SET status = 'available'
        WHERE id = $1
      `, [b.step_id]);
    }

    await c.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await c.query('ROLLBACK');
    res.status(400).json({ error: e.message });
  } finally {
    c.release();
  }
});

// Mengedit data peserta dari dashboard admin
app.put('/api/admin/bookings/:orderId', basicAuth, async (req, res) => {
  const { fullName, phone, email } = req.body || {};

  if (!fullName?.trim() || !phone?.trim() || !email?.trim()) {
    return res.status(400).json({
      error: 'Nama, WhatsApp, dan email wajib diisi.'
    });
  }

  try {
    const r = await pool.query(`
      UPDATE bookings
      SET full_name = $1,
          phone = $2,
          email = $3
      WHERE order_id = $4
      AND status IN ('pending', 'paid', 'rejected')
      RETURNING order_id
    `, [
      fullName.trim(),
      phone.trim(),
      email.trim().toLowerCase(),
      req.params.orderId
    ]);

    if (!r.rowCount) {
      return res.status(404).json({
        error: 'Pesanan tidak ditemukan.'
      });
    }

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Menghapus booking dari dashboard admin
app.delete('/api/admin/bookings/:orderId', basicAuth, async (req, res) => {
  const c = await pool.connect();

  try {
    await c.query('BEGIN');

    const b = (
      await c.query(`
        SELECT *
        FROM bookings
        WHERE order_id = $1
        FOR UPDATE
      `, [req.params.orderId])
    ).rows[0];

    if (!b) {
      throw Error('Pesanan tidak ditemukan.');
    }

    if (b.status === 'paid') {
      throw Error(
        'Pesanan lunas tidak bisa dihapus dari dashboard. Ubah status melalui prosedur admin terlebih dahulu.'
      );
    }

    await c.query(`
      UPDATE steps
      SET status = 'available'
      WHERE id = $1
      AND status = 'pending'
    `, [b.step_id]);

    await c.query(
      'DELETE FROM bookings WHERE id = $1',
      [b.id]
    );

    await c.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await c.query('ROLLBACK');
    res.status(400).json({ error: e.message });
  } finally {
    c.release();
  }
});

// Mengunduh rekap booking CSV
app.get('/api/admin/export.csv', basicAuth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT
      b.order_id,
      b.full_name,
      b.phone,
      b.email,
      c.name class_name,
      s.step_number,
      b.amount,
      b.status,
      b.created_at
    FROM bookings b
    JOIN classes c ON c.id = b.class_id
    JOIN steps s ON s.id = b.step_id
    WHERE c.slug IN ('pemula', 'middle')
    ORDER BY b.created_at DESC
  `);

  const esc = v =>
    '"' + String(v ?? '').replace(/"/g, '""') + '"';

  const csv = [
    'Order,Nama,WhatsApp,Email,Kelas,Nomor,Harga,Status,Dibuat',
    ...rows.map(r => [
      r.order_id,
      r.full_name,
      r.phone,
      r.email,
      r.class_name,
      r.step_number,
      r.amount,
      r.status,
      r.created_at
    ].map(esc).join(','))
  ].join('\r\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="rekap-aeroparty.csv"'
  );
  res.send('\ufeff' + csv);
});

// Statistik dashboard admin
app.get('/api/admin/stats', basicAuth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT
      (
        SELECT COUNT(*)
        FROM bookings
        WHERE status = 'paid'
      )::int paid,
      (
        SELECT COUNT(*)
        FROM bookings
        WHERE status = 'pending'
      )::int pending,
      (
        SELECT COUNT(*)
        FROM steps s
        JOIN classes c ON c.id = s.class_id
        WHERE c.slug IN ('pemula', 'middle')
        AND s.status = 'available'
      )::int available,
      (
        SELECT COALESCE(SUM(amount), 0)
        FROM bookings
        WHERE status = 'paid'
      )::int revenue
  `);

  res.json(rows[0]);
});

// Halaman admin dan halaman utama
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Persiapan database
let dbReady;

export function ensureDb() {
  if (!dbReady) {
    dbReady = initDb();
  }

  return dbReady;
}

export { app };

// Jalankan server lokal, tetapi tidak saat berjalan di Netlify
if (!process.env.NETLIFY) {
  ensureDb()
    .then(() => {
      app.listen(port, () => {
        console.log(`${appName} berjalan di port ${port}`);
      });
    })
    .catch(e => {
      console.error('Database initialization failed:', e);
      process.exit(1);
    });
}
