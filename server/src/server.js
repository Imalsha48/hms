// Hospital time zone. Must be set before anything uses dates.
// Cloud servers (Render) run on UTC; without this, "09:00" in a doctor's
// schedule would mean 09:00 UTC (14:30 in Sri Lanka).
process.env.TZ = process.env.TZ || 'Asia/Colombo';

require('dotenv').config();
const app = require('./app');

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is missing in .env');
  process.exit(1);
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`HMS API running on http://localhost:${PORT} (time zone ${process.env.TZ})`));
