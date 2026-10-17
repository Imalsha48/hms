# Deploying HMS (Aiven MySQL + Render)

The whole system runs on **one URL**: Express serves the API at `/api/*` and the built React app for every other path.

```
Browser ──> Render (Node.js: Express API + React build) ──> Aiven (MySQL)
                     ▲
                GitHub repo (every push redeploys)
```

## 1. Database on Aiven (free, no credit card)

1. Sign up at **aiven.io** and create a new service: **MySQL**, plan **Free**.
2. Wait until the status says **Running**.
3. On the service's **Overview** page, copy the **Service URI**. It looks like:
   `mysql://avnadmin:PASSWORD@mysql-xxxx.aivencloud.com:12345/defaultdb?ssl-mode=REQUIRED`
4. Change the end of it for Prisma: replace `?ssl-mode=REQUIRED` with `?sslaccept=accept_invalid_certs`.
   This is your **production `DATABASE_URL`**. Keep it private.

## 2. Create the tables and sample data (from your laptop)

In PowerShell, inside the `server` folder:

```powershell
$env:DATABASE_URL="mysql://avnadmin:PASSWORD@mysql-xxxx.aivencloud.com:12345/defaultdb?sslaccept=accept_invalid_certs"
npx prisma migrate deploy
npm run db:seed
Remove-Item Env:DATABASE_URL
```

The last line makes sure your local commands go back to your local MySQL.

## 3. App on Render (free)

1. Sign up at **render.com** with your GitHub account.
2. Click **New, then Web Service**, and pick your `hms` repo.
3. Settings:

| Setting | Value |
|---|---|
| Root Directory | *(leave empty)* |
| Runtime | Node |
| Build Command | `npm run build` |
| Start Command | `npm start` |
| Instance Type | **Free** |

4. Under **Environment Variables**, add:

| Key | Value |
|---|---|
| `DATABASE_URL` | the Aiven URL from step 1 |
| `JWT_SECRET` | a long random string (different from your local one) |
| `JWT_EXPIRES_IN` | `8h` |
| `TZ` | `Asia/Colombo` |

5. Click **Create Web Service**. The first build takes a few minutes.
6. When it says **Live**, open the URL (`https://hms-xxxx.onrender.com`) and log in as `admin` / `Password123`.

From now on, every `git push` to `main` redeploys automatically. New database migrations run during the build (`prisma migrate deploy`).

## 4. Demo data (optional, recommended)

Fills the live site with two weeks of past activity, so the dashboard and reports aren't empty.
Run it once, from your laptop, with the Aiven URL:

```powershell
$env:DATABASE_URL="<your Aiven URL>"
npm run db:seed-demo
Remove-Item Env:DATABASE_URL
```

## 5. Automatic daily backups (GitHub Actions)

1. On GitHub, open your repo, then **Settings**, **Secrets and variables**, **Actions**, **New repository secret**.
2. Name: `DATABASE_URL`. Value: your Aiven URL. Save.
3. Open the **Actions** tab, choose **Database backup**, then **Run workflow** to test it now.
4. When it finishes (green tick), open the run. The backup file is under **Artifacts**.

From then on, it runs every night at 00:00 Sri Lanka time.

## Before sending the link

- Change the `admin` password on the live site, or tell the reviewers the demo logins.
- The free plan **sleeps after 15 minutes without visitors**. The first visit after that takes about a minute.
  Open the link yourself a few minutes before anyone reviews it.
- Aiven may power off a free database that isn't used for a long time (they email first). You can power it back on from the Aiven console.

## Troubleshooting

| Problem | Fix |
|---|---|
| Build fails at `prisma migrate deploy` | Check `DATABASE_URL` on Render: it must end with `?sslaccept=accept_invalid_certs` |
| Site loads but login says "Internal server error" | Check the **Logs** tab on Render. Usually it's a wrong `DATABASE_URL`, or the seed was never run |
| `JWT_SECRET is missing` in logs | Add the environment variable on Render and redeploy |
