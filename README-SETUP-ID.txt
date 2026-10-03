AEROPARTY 2026 — VERSI TRANSFER MANUAL

FITUR
- Kelas Pemula dan Middle, masing-masing 50 posisi.
- Tampilan navy/gold dan denah posisi zigzag dipertahankan.
- Peserta mengisi data, transfer ke rekening BCA, lalu mengunggah bukti.
- Admin memeriksa bukti dari halaman /admin dan menyetujui/menolak.
- Posisi menjadi terkunci setelah admin menyetujui. Jika ditolak, posisi tersedia kembali.

REKENING TRANSFER
Bank: BCA
Nomor: 4372508161
Atas nama: Cita Amadhea
Nominal: sesuai harga yang ditampilkan website.

PERSIAPAN
1. Ekstrak ZIP.
2. Pastikan Node.js versi 20 atau lebih baru dan PostgreSQL tersedia.
3. Salin .env.example menjadi .env, lalu isi DATABASE_URL sesuai database PostgreSQL.
4. Ganti ADMIN_PASSWORD dengan kata sandi kuat.
5. Buka terminal pada folder proyek dan jalankan: npm install
6. Jalankan: npm start
7. Buka http://localhost:3000. Dashboard admin: http://localhost:3000/admin

CATATAN PENTING
- Database perlu bisa diakses oleh server. Saat pertama dijalankan, tabel dan data kelas/posisi dibuat otomatis.
- Bukti transfer disimpan di folder private_uploads pada server. Pada layanan hosting dengan penyimpanan sementara, file dapat hilang saat deploy/restart; gunakan penyimpanan permanen sebelum dipakai untuk acara sungguhan.
- Fitur ini memakai verifikasi transfer manual, bukan Midtrans/Virtual Account.
- Jangan membagikan file .env atau password admin.
