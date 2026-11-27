# Deployment checklist

## Required services
- PostgreSQL 15+ (Neon, Supabase or managed Postgres). Set both `DATABASE_URL` (runtime/pooler) and `DIRECT_URL` (direct connection for migrations).
- Node.js 20+ deployment target with Next.js 15 support.
- Razorpay account and webhook endpoint for online payments.
- SMS provider (MSG91 or Twilio) for production OTP delivery.
- Email provider (Resend) for transactional email.

## First deployment
1. Configure all secrets in the hosting provider. Never commit `.env.local`.
2. Set `NEXT_PUBLIC_APP_URL` to the canonical HTTPS URL and generate a unique 32+ character `AUTH_SECRET`.
3. Set `DATABASE_URL` and `DIRECT_URL`, then run `npm run db:deploy`.
4. Run `npm run db:seed` once with a strong `SEED_ADMIN_PASSWORD`.
5. Replace the demo branch address, phone, FSSAI number, GSTIN, PIN-code delivery zones and menu with verified business data.
6. Configure Razorpay test keys first. Register `/api/payments/razorpay/webhook` for `payment.captured`, `payment.failed`, `order.paid` and `refund.processed`; set the webhook secret.
7. Set `OTP_PROVIDER=msg91` or `twilio` and configure the provider credentials/template. Console OTP is development-only.
8. Configure Resend or SMTP-compatible email delivery before enabling customer email notifications.
9. Set `CRON_SECRET` and schedule `GET /api/jobs/expire-pending` every 5–10 minutes with `Authorization: Bearer <CRON_SECRET>`.
10. Verify customer OTP login, staff password login, role restrictions, menu availability, quote totals, delivery PIN validation, reservations, COD OTP, Razorpay test payment and webhook replay.
11. Add monitoring/error reporting, database backups, privacy policy, terms, cancellation/refund policy and verified food-safety disclosures.

## Production notes
- The in-process SSE event bus is suitable for a single application instance. Use a shared pub/sub transport (Postgres LISTEN/NOTIFY or Redis) before horizontally scaling.
- Rate limiting is database-backed; use Redis/Upstash for high-volume multi-region deployments.
- Keep GST rates, whether packaging/delivery are taxable, and invoice treatment aligned with the restaurant's CA advice. The starter configuration uses 5% GST and treats packaging/delivery as non-taxable.
- Seed FSSAI/GSTIN values are conspicuous placeholders and must never be presented as verified credentials.
- Test refund reconciliation and manual exception handling with the payment provider before going live.
