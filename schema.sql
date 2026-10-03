CREATE TABLE IF NOT EXISTS classes (
  id SERIAL PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  slug VARCHAR(80) NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS steps (
  id SERIAL PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL CHECK (step_number BETWEEN 1 AND 50),
  status VARCHAR(20) NOT NULL DEFAULT 'available' CHECK (status IN ('available','pending','paid')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(class_id, step_number)
);

CREATE TABLE IF NOT EXISTS bookings (
  id BIGSERIAL PRIMARY KEY,
  order_id VARCHAR(50) NOT NULL UNIQUE,
  class_id INTEGER NOT NULL REFERENCES classes(id),
  step_id INTEGER NOT NULL REFERENCES steps(id),
  full_name VARCHAR(120) NOT NULL,
  phone VARCHAR(40) NOT NULL,
  email VARCHAR(180) NOT NULL,
  amount INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','rejected','expired','cancelled')),
  bank VARCHAR(20),
  va_number VARCHAR(80),
  midtrans_transaction_id VARCHAR(100),
  payment_expiry TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  proof_file TEXT,
  admin_note TEXT
);

CREATE INDEX IF NOT EXISTS idx_steps_class_status ON steps(class_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_order ON bookings(order_id);
CREATE INDEX IF NOT EXISTS idx_bookings_email ON bookings(email);

INSERT INTO classes (name, slug, description) VALUES
('Kelas Pemula', 'pemula', 'Untuk peserta yang baru memulai dan ingin menikmati AeroParty dengan nyaman.'),
('Kelas Middle', 'middle', 'Untuk peserta dengan pengalaman latihan tingkat menengah.')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO steps (class_id, step_number)
SELECT c.id, n
FROM classes c
CROSS JOIN generate_series(1, 50) AS n
ON CONFLICT (class_id, step_number) DO NOTHING;
