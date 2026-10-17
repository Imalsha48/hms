# Hospital Management System (HMS)

Stack: **MySQL · Express · React · Node.js** (+ Prisma ORM, JWT auth)

## Architecture (spec section 5)

| Layer | Where |
|---|---|
| Presentation | `client/` (React) |
| Application | `server/src/routes/` (HTTP endpoints, validation) |
| Business Logic | `server/src/services/` (rules, calculations) |
| Database | `server/prisma/schema.prisma` + MySQL |

Cross-cutting: `server/src/middleware/` holds authentication, role-based access control, audit logging and error handling.

## Setup

### 1. Install MySQL
Install MySQL 8 (or XAMPP), then create the database:
```sql
CREATE DATABASE hms;
```

### 2. Backend
```bash
cd server
npm install
cp .env.example .env        # then edit DATABASE_URL and JWT_SECRET
npx prisma migrate dev --name init   # creates all tables
npm run db:seed                      # sample data + logins
npm run dev                          # API on http://localhost:5000
```

Check it works: open http://localhost:5000/api/health

### 3. Test login
All seeded users have password `Password123`:

| Role | Username |
|---|---|
| Admin | `admin` |
| Doctor | `dr.perera`, `dr.fernando`, `dr.silva` |
| Nurse | `nurse.kumari` |
| Receptionist | `reception` |
| Lab staff | `lab` |
| Pharmacist | `pharmacist` |
| Accountant | `accountant` |

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Password123"}'
```
Copy the `token` from the response, then:
```bash
curl http://localhost:5000/api/users -H "Authorization: Bearer <token>"
```

Tip: `npm run db:studio` opens a browser view of every table.

### 4. Frontend
```bash
cd client
npm install
npm run dev        # opens on http://localhost:5173
```
Keep the backend (`npm run dev` in `server/`) running in a second terminal.
The Vite dev server forwards `/api` calls to port 5000, so no extra config is needed.

## API so far

| Method | Endpoint | Who |
|---|---|---|
| POST | `/api/auth/login` | Public |
| GET | `/api/auth/me` | Logged in |
| POST | `/api/auth/logout` | Logged in |
| POST | `/api/auth/change-password` | Logged in |
| GET / POST | `/api/users` | Admin |
| PUT | `/api/users/:id` | Admin |
| POST | `/api/users/:id/reset-password` | Admin |
| GET | `/api/users/audit-logs` | Admin |
| GET | `/api/dashboard` | Logged in |
| GET / POST | `/api/patients` (`?search=&page=`) | View: all · Create: Receptionist, Nurse, Doctor |
| GET / PUT / DELETE | `/api/patients/:id` | Delete: Admin only |
| POST / DELETE | `/api/patients/:id/documents` | Receptionist, Nurse, Doctor |
| GET / POST / PUT / DELETE | `/api/departments` | View: all · Change: Admin |
| GET / POST / PUT | `/api/doctors` | View: all · Change: Admin |
| GET | `/api/doctors/:id/slots?date=YYYY-MM-DD` | Logged in |
| PUT | `/api/doctors/:id/schedules` | Admin |
| GET / POST | `/api/appointments` (`?date=&doctorId=`) | Receptionist, Nurse, Doctor (doctors see only their own) |
| PATCH | `/api/appointments/:id/reschedule` · `/cancel` · `/complete` | Receptionist, Nurse, Doctor |
| GET / POST | `/api/records` (`?patientId=`) | View: clinical staff · Create: Doctor (saves record + prescription + lab orders together) |
| GET | `/api/lab/tests` · POST / PUT `/api/lab/tests` | View: all · Change: Lab staff |
| GET / POST | `/api/lab/requests` (`?status=`) | Lab staff, Doctor, Nurse · Create: Doctor |
| PATCH | `/api/lab/requests/:id/collect` · `/result` · `/cancel` | Lab staff (collect: also Nurse; cancel: also Doctor) |
| GET | `/api/lab/requests/:id/report` | Logged in |
| GET / POST / PUT | `/api/pharmacy/medicines` | View: all · Change: Pharmacist |
| POST | `/api/pharmacy/medicines/:id/batches` | Pharmacist (receive stock) |
| GET | `/api/pharmacy/prescriptions` (`?status=PENDING`) | Pharmacist, Doctor, Nurse |
| POST | `/api/pharmacy/prescriptions/:id/dispense` | Pharmacist |

## Business rules (appointments)
- Cannot book in the past
- Must fall inside the doctor's weekly schedule
- A doctor cannot have two overlapping appointments; neither can a patient
- Rescheduling re-checks all of the above

## Business rules (consultation, lab, pharmacy)
- A consultation saves the medical record, prescription and lab orders in **one transaction**, and completes the appointment. If any part fails, nothing is saved
- A doctor can only write a record for their own appointment
- Lab requests move strictly `REQUESTED -> SAMPLE_COLLECTED -> COMPLETED`; a step can't be skipped
- Stock is tracked per **batch** with its own expiry date
- Dispensing uses **FEFO** (First Expiry, First Out). Expired batches are never dispensed
- A prescription is only dispensed if **every** medicine has enough stock (no half-dispensing)
- Uploaded files are stored in the database, so they survive restarts on cloud hosting

## Deployment
See [DEPLOY.md](DEPLOY.md) (Aiven MySQL + Render, one URL for the whole system).

## Security features (spec section 4)
- Passwords hashed with bcrypt (never stored in plain text)
- JWT tokens expire after `JWT_EXPIRES_IN`, which acts as the automatic session timeout
- Role-based access control via `authorize('ROLE', ...)` middleware
- Every create/update/delete is written to `AuditLog`, with passwords masked
- Logged out automatically after 15 minutes of inactivity (frontend)
- Same error for wrong username or wrong password (prevents username guessing)
