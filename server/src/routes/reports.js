// /api/reports/:type?from=YYYY-MM-DD&to=YYYY-MM-DD[&format=csv&table=0]
// type: patients | appointments | revenue | pharmacy | laboratory | staff
const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { authorize } = require('../middleware/auth');
const { parseLocalDate } = require('../utils/validate');
const { toCsv } = require('../utils/csv');
const reports = require('../services/reportService');

// Revenue is the accountant's report; the rest are management reports (admin always has access)
const ACCESS = {
  patients: ['ACCOUNTANT'], appointments: ['ACCOUNTANT'], revenue: ['ACCOUNTANT'],
  pharmacy: ['ACCOUNTANT', 'PHARMACIST'], laboratory: ['ACCOUNTANT', 'LAB_STAFF'], staff: [],
};

// Default period: 1st of this month to today
function getRange(q) {
  const now = new Date();
  const from = q.from ? parseLocalDate(q.from) : new Date(now.getFullYear(), now.getMonth(), 1);
  const toDay = q.to ? parseLocalDate(q.to) : new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const to = new Date(toDay.getFullYear(), toDay.getMonth(), toDay.getDate() + 1); // include the whole "to" day
  if (to <= from) throw new AppError('"To" date must be on or after "From" date');
  if ((to - from) / 86400000 > 366) throw new AppError('Please choose a period of one year or less');
  return { from, to };
}

router.get(
  '/:type',
  (req, res, next) => {
    const roles = ACCESS[req.params.type];
    if (!roles) return next(new AppError('Unknown report', 404));
    return authorize(...roles)(req, res, next);
  },
  asyncHandler(async (req, res) => {
    const range = getRange(req.query);
    const report = await reports[req.params.type](range);

    if (req.query.format === 'csv') {
      const table = report.tables[Number(req.query.table) || 0];
      if (!table) throw new AppError('Table not found', 404);
      const from = req.query.from || 'month-start';
      const to = req.query.to || 'today';
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.attachment(`${req.params.type}-report-${from}-to-${to}.csv`);
      return res.send(toCsv(table.columns, table.rows));
    }
    res.json(report);
  })
);

module.exports = router;
