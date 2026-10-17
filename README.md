# Hospital Management System (HMS)

A web-based system that manages a hospital's patients, doctors, appointments, medical records,
laboratory, pharmacy, billing, inpatient admissions, staff and reports, with role-based access for
seven types of user.

**Stack:** MySQL · Express · React · Node.js, with Prisma ORM, JWT authentication and Material UI.
**Live demo:** _add your Render URL here_

## Demo logins

All demo accounts use the password `Password123`.

| Role | Username | What to try |
|---|---|---|
| Administrator | `admin` | Everything, plus Users & security (audit log, backup) |
| Doctor | `dr.perera` | Appointments, then Consult: diagnosis, prescription, lab tests |
| Nurse | `nurse.kumari` | Check in, admit and discharge patients, collect lab samples |
| Receptionist | `reception` | Register patients, book appointments, create invoices |
| Lab staff | `lab` | Laboratory: collect sample, enter result, attach report |
| Pharmacist | `pharmacist` | Pharmacy: dispense, receive stock, expiry alerts |
| Accountant | `accountant` | Billing, payments, revenue reports |

## Architecture (spec section 5)

```
 Presentation layer     client/  React + Material UI (role-based menus, responsive)
        |  HTTPS / JSON (JWT in the Authorization header)
 Application layer      server/src/routes/       endpoints, input checks, role checks
        |                server/src/middleware/   auth, RBAC, audit log, errors, uploads
 Business logic layer   server/src/services/     booking rules, billing, FEFO dispensing, reports, backup
        |
 Database layer         server/prisma/schema.prisma  ->  MySQL (Prisma ORM, migrations)
```

In production, a single Express server on Render serves both the API (`/api/*`) and the built React
app, so the whole system runs on one URL. The database is MySQL on Aiven.

## How the spec is covered

| Spec | Where |
|---|---|
| 3.1 User management: login, logout, passwords, roles, access control | Login page, Change password, Users & security; `middleware/auth.js` |
| 3.2 Patients: register, update, search, history, documents | Patients and Patient profile (history tabs, document upload) |
| 3.3 Doctors: add, update, departments, schedules | Doctors & departments (weekly schedule editor) |
| 3.4 Appointments: book, cancel, reschedule, status | Appointments (day list + month calendar, free-slot picker) |
| 3.5 Medical records: diagnosis, prescriptions, treatment history, reports | Consultation screen; Patient profile tabs |
| 3.6 Laboratory: requests, sample collection, results, reports | Laboratory (workflow tabs, report upload) |
| 3.7 Pharmacy: inventory, prescriptions, stock, expiry | Pharmacy (batches, FEFO dispensing, alerts) |
| 3.8 Billing: consultation, lab, pharmacy, admission charges; invoices; payments | Billing (auto-collects unbilled charges, part payments, print receipt) |
| 3.9 Staff: employees, attendance, departments, leave | Staff; dashboard check-in / check-out |
| 3.10 Reports: patient, appointment, revenue, pharmacy, laboratory, staff | Reports (period filter, chart, CSV export) |
| 4 Security: secure login, encryption, RBAC, audit logs, session timeout | bcrypt, JWT expiry + 15-minute idle logout, audit log viewer |
| 4 Reliability: daily backup, recovery | Automatic daily/weekly backups, restore script (see below) |
| 6 Database modules | `server/prisma/schema.prisma` (24 tables) |
| 7 UI: login, dashboard, patient, appointment, billing screens | All implemented, including calendar view and printable receipt |

## Key business rules

**Appointments**
- An appointment can't be booked in the past, and it must fall inside the doctor's weekly schedule.
- A doctor can't have two overlapping appointments, and neither can a patient. Rescheduling re-checks these rules.

**Consultation**
- A consultation saves the record, prescription and lab orders in **one transaction**, and completes the appointment.
- A doctor can only write records for their own appointments.

**Laboratory**
- A lab request follows `REQUESTED -> SAMPLE_COLLECTED -> COMPLETED`. Steps can't be skipped.

**Pharmacy**
- Stock is tracked per **batch** with its own expiry date.
- Dispensing uses **FEFO** (first expiry, first out). Expired batches are never dispensed.
- A prescription is never half-dispensed: every medicine must have enough stock first.

**Billing**
- Each charge (consultation, lab test, prescription, admission) can be billed **only once**.
- Prices are recalculated on the server.
- A discount can't exceed the subtotal, and a payment can't exceed the balance due.
- Invoice status moves automatically: `UNPAID -> PARTIAL -> PAID`.

**Admissions**
- One patient per bed. Claiming a bed is atomic, so two nurses can't admit into the same bed.
- Admission charge = days stayed (minimum 1) x ward daily rate.

**Staff**
- A check-in after 08:30 is marked LATE.
- Leave can't overlap existing pending or approved leave.

**Privacy and dates**
- Receptionists and accountants can't see diagnoses, prescriptions or lab results.
- Uploaded files are stored in the database. All server dates use the hospital time zone (`TZ=Asia/Colombo`).

## Security (spec section 4)
- Passwords are hashed with bcrypt. Login gives the same error for a wrong username or a wrong password.
- JWT tokens expire after 8 hours. The frontend also logs users out after 15 minutes of inactivity.
- Every route checks the user's role (`authorize(...)`). Deactivated accounts are blocked immediately.
- Every create, update and delete is recorded in the audit log (passwords masked), as are logins and failed logins. Admins can filter it under Users & security.

## Backup and disaster recovery (spec section 10)

| What | How |
|---|---|
| Automatic daily backup | GitHub Actions (`.github/workflows/backup.yml`) backs up the whole database every night at 00:00 Sri Lanka time. Kept for 7 days. |
| Weekly full backup | Sunday's backup is kept for 90 days. |
| Manual backup | Admin: Users & security, Backup, then Download backup now. Or run `npm run backup` in `server/`. |
| Format | One JSON file with every table, including uploaded files. It can be restored into any MySQL database. |
| Audit trail | Every change is logged with who, what, when and from which IP. |

**Recovery plan** (for example, the database is lost or corrupted):
1. Download the latest backup: GitHub, Actions, Database backup, the newest run, Artifacts.
2. Create a new empty MySQL database (on Aiven or locally) and point `DATABASE_URL` at it.
3. In `server/`, run `npx prisma migrate deploy` to create the tables.
4. Run `npm run restore -- path\to\hms-backup-....json --yes`. It runs in one transaction, so if it fails nothing changes.
5. Update `DATABASE_URL` on Render if the database moved. Then log in and check the Dashboard and Reports.

With nightly backups, at most one day of data can be lost. Recovery takes about 15–30 minutes.

## Run locally

Requirements: Node.js 20+, MySQL 8.

```bash
# 1. Database (MySQL Workbench or the CLI)
CREATE DATABASE hms;

# 2. Backend
cd server
npm install
cp .env.example .env            # set DATABASE_URL and JWT_SECRET
npx prisma migrate dev          # create the tables
npm run db:seed                 # demo users, doctors, wards, lab tests, medicines
npm run db:seed-demo            # optional: two weeks of past activity for reports
npm run dev                     # API on http://localhost:5000

# 3. Frontend (second terminal)
cd client
npm install
npm run dev                     # http://localhost:5173
```

**Adding a database change on Windows.** Windows MySQL lowercases table names, but Linux (production) is case-sensitive. So for each new migration:
```powershell
npx prisma migrate dev --create-only --name <name>
powershell -ExecutionPolicy Bypass -File scripts\fix-migration-case.ps1
npx prisma migrate dev
```

## Deployment
See [DEPLOY.md](DEPLOY.md): MySQL on Aiven plus a Render web service. Every push to `main` redeploys automatically.

## API overview
All endpoints are under `/api` and need a valid token (except `/api/auth/login` and `/api/health`).
The admin role passes every role check.

| Area | Endpoints |
|---|---|
| Auth | `POST auth/login`, `GET auth/me`, `POST auth/logout`, `POST auth/change-password` |
| Users (admin) | `GET/POST users`, `PUT users/:id`, `POST users/:id/reset-password`, `GET users/audit-logs`, `GET users/backup` |
| Patients | `GET/POST patients`, `GET/PUT/DELETE patients/:id`, `POST/DELETE patients/:id/documents`, `GET patients/:id/documents/:docId/file` |
| Doctors | `GET/POST doctors`, `GET/PUT doctors/:id`, `GET doctors/:id/slots?date=`, `PUT doctors/:id/schedules`, `GET/POST/PUT/DELETE departments` |
| Appointments | `GET/POST appointments`, `PATCH appointments/:id/reschedule`, `/cancel`, `/complete` |
| Records | `GET/POST records` (consultation: record + prescription + lab orders) |
| Laboratory | `GET/POST lab/tests`, `GET/POST lab/requests`, `PATCH lab/requests/:id/collect`, `/result`, `/cancel`, `GET lab/requests/:id/report` |
| Pharmacy | `GET/POST/PUT pharmacy/medicines`, `POST pharmacy/medicines/:id/batches`, `GET pharmacy/prescriptions`, `POST pharmacy/prescriptions/:id/dispense` |
| Billing | `GET billing/unbilled`, `GET/POST billing/invoices`, `GET/DELETE billing/invoices/:id`, `POST billing/invoices/:id/payments` |
| Admissions | `GET admissions/wards`, `GET/POST admissions`, `PATCH admissions/:id/transfer`, `/discharge` |
| Staff | `GET/POST/PUT staff/employees`, `GET/PUT staff/attendance`, `GET/POST staff/leaves`, `PATCH staff/leaves/:id`, `GET staff/me`, `POST staff/me/check-in`, `/check-out` |
| Reports | `GET reports/:type?from=&to=` with type `patients`, `appointments`, `revenue`, `pharmacy`, `laboratory` or `staff`; add `&format=csv&table=0` for CSV |
| Dashboard | `GET dashboard` |

## Future enhancements (spec section 12)
Mobile app · patient portal · SMS and email reminders · telemedicine · insurance claims · AI-based
decision support (for example drug-allergy warnings and risk scoring) · biometric login.
