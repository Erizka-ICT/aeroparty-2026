# AeroParty 2026 — Step Position Booking

A ready-to-deploy Node.js + PostgreSQL booking website for AeroParty 2026.

## Included
- 3 classes: Pemula, Middle, Aerobik
- 50 step positions per class
- Real-time-ish availability refresh through API
- Atomic position reservation to prevent two users booking the same position at once
- Pending / paid / expired / cancelled states
- Midtrans Virtual Account integration (BCA, BNI, BRI, Permata)
- Midtrans signed notification endpoint
- Booking proof page with print/save-to-PDF
- Simple admin dashboard at `/admin`
- Responsive dark navy + gold visual style inspired by the supplied reference image

## Important before publishing
This project is complete as an application, but a real payment gateway cannot be activated without the organizer's own Midtrans account credentials and a hosted PostgreSQL database. Never put the Midtrans Server Key directly into frontend code.

Midtrans's official documentation says the Server Key is for secure server-side API calls, and payment notifications should be verified with the signature key. The notification formula is SHA512(order_id + status_code + gross_amount + ServerKey). See the official docs:
- https://docs.midtrans.com/docs/access-keys
- https://docs.midtrans.com/docs/https-notification-webhooks
- https://docs.midtrans.com/docs/coreapi-core-api-bank-transfer-integration

## 1. Local test
1. Install Node.js 20+.
2. Create a PostgreSQL database (Supabase, Neon, Railway, Render PostgreSQL, or local PostgreSQL).
3. Copy `.env.example` to `.env`.
4. Fill `DATABASE_URL`.
5. Put your Midtrans Sandbox Server Key into `MIDTRANS_SERVER_KEY`.
6. Run:
   ```bash
   npm install
   npm start
   ```
7. Open http://localhost:3000

## 2. Midtrans notification URL
After deployment, set this in Midtrans Dashboard > Settings > Configuration:

`https://YOUR-DOMAIN.com/api/midtrans/notification`

Use HTTPS for production.

## 3. Production
- Set `MIDTRANS_ENV=production`.
- Replace `MIDTRANS_SERVER_KEY` with the Production Server Key.
- Keep `ADMIN_PASSWORD` strong and private.
- Set `APP_BASE_URL` to the real domain.
- Make sure PostgreSQL is persistent and backups are enabled.
- Update the step price through `STEP_PRICE_IDR`.

## 4. Deployment recommendation
For a simple deployment, use Render Web Service + Render PostgreSQL, or another Node.js host + managed PostgreSQL. This app is designed as a normal long-running Node server, not a static-only site.

## 5. Admin
Open `/admin`. The browser will ask for the Basic Auth username/password from `.env`.

## 6. Payment flow
Participant selects class -> selects step -> enters details -> selects VA bank -> server creates Midtrans bank transfer transaction -> VA appears -> participant transfers -> Midtrans calls notification endpoint -> signature is verified -> booking changes from pending to paid -> step changes from pending to paid -> participant can save/print the proof.

## Render shortcut
The included `render.yaml` can provision a Node web service and PostgreSQL database. You still need to provide `MIDTRANS_SERVER_KEY` in Render's environment settings. For real payments, use the Production key and `MIDTRANS_ENV=production` after completing Midtrans production activation.
