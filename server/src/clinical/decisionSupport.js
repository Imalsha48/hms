// =============================================================
// Clinical decision support engine (spec 12: AI-Based Decision Support)
// Pure functions: data in -> explainable alerts out. No database access here,
// so every rule is easy to unit-test and to explain.
//
// Each alert:  { severity: 'high'|'medium'|'info', category, title, why, evidence, medicine? }
//   why      = the medical reasoning (from the knowledge base)
//   evidence = the patient data that triggered it
// =============================================================
const K = require('./knowledge');

const SEVERITY_ORDER = { high: 0, medium: 1, info: 2 };
const sortAlerts = (alerts) => alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
const lower = (s) => String(s || '').toLowerCase();
const ageOf = (dob) => (dob ? Math.floor((Date.now() - new Date(dob)) / (365.25 * 86400000)) : null);
const pretty = (c) => c.replace(/_/g, ' ');

// Which drug classes a medicine belongs to, and its generic drug name
function classify(medicine) {
  const text = `${lower(medicine.name)} ${lower(medicine.genericName)}`;
  const classes = [];
  let drug = null;
  for (const [cls, members] of Object.entries(K.DRUG_CLASSES)) {
    const hit = members.find((m) => text.includes(m));
    if (hit) { classes.push(cls); drug = drug || hit; }
  }
  if (!drug) drug = Object.keys(K.MAX_DAILY_MG).find((d) => text.includes(d)) || lower(medicine.name).split(/\s+/)[0];
  return { classes, drug };
}

// Free-text allergy field -> { classes:Set, words:[...] }
function parseAllergies(text) {
  const words = lower(text).split(/[^a-z-]+/).filter((w) => w.length > 2);
  const classes = new Set(words.map((w) => K.ALLERGY_TERMS[w]).filter(Boolean));
  return { classes, words, raw: text };
}

// mg per dose from "2 tablets" x strength ("500mg" in strength or name). null if unknown (e.g. syrups in ml)
function mgPerDose(medicine, dosage) {
  if (/ml\b/i.test(dosage || '')) return null;
  const strength = String(medicine.strength || '').match(/(\d+(?:\.\d+)?)\s*mg/i) || String(medicine.name || '').match(/(\d+(?:\.\d+)?)\s*mg/i);
  if (!strength) return null;
  const count = parseFloat(String(dosage || '').match(/(\d+(?:\.\d+)?)/)?.[1] || '1');
  return count * parseFloat(strength[1]);
}

function dosesPerDay(frequency) {
  for (const [re, n] of K.FREQUENCY_PER_DAY) if (re.test(frequency || '')) return n;
  const m = String(frequency || '').match(/(\d+)\s*(?:x|times)/i);
  return m ? Number(m[1]) : null;
}

/**
 * Checks a prescription before it is saved or dispensed.
 * @param patient  { allergies, dateOfBirth }
 * @param items    [{ medicine: {id,name,genericName,strength}, dosage, frequency }]
 * @param current  medicines the patient is already taking: [{ medicine, prescribedAt }]
 */
function analyzePrescription({ patient = {}, items = [], current = [] }) {
  const alerts = [];
  const allergy = parseAllergies(patient.allergies);
  const age = ageOf(patient.dateOfBirth);
  const newMeds = items.filter((i) => i.medicine).map((i) => ({ ...i, ...classify(i.medicine) }));
  const oldMeds = current.filter((c) => c.medicine).map((c) => ({ ...c, ...classify(c.medicine) }));

  for (const m of newMeds) {
    const name = m.medicine.name;

    // 1. Allergy: same class, or the drug itself named in the allergy field
    const allergicClass = m.classes.find((c) => allergy.classes.has(c));
    if (allergicClass || allergy.words.includes(m.drug)) {
      alerts.push({
        severity: 'high', category: 'Allergy', medicine: name,
        title: `${name}: patient is allergic`,
        why: allergicClass
          ? `${name} is a ${pretty(allergicClass)}. Patients allergic to one ${pretty(allergicClass)} can react to all of them, sometimes severely (anaphylaxis).`
          : `${name} matches a drug listed in the patient's allergies.`,
        evidence: `Recorded allergy: "${allergy.raw}"`,
      });
    }
    // 2. Cross-reactivity
    for (const x of K.CROSS_REACTIVITY) {
      if (allergy.classes.has(x.allergyClass) && m.classes.includes(x.drugClass)) {
        alerts.push({ severity: x.severity, category: 'Allergy', medicine: name, title: `${name}: possible cross-reaction`, why: x.why, evidence: `Recorded allergy: "${allergy.raw}"` });
      }
    }
    // 3. Maximum daily dose
    const perDose = mgPerDose(m.medicine, m.dosage);
    const perDay = dosesPerDay(m.frequency);
    const limit = K.MAX_DAILY_MG[m.drug];
    if (limit && perDose && perDay && perDose * perDay > limit.mg) {
      alerts.push({
        severity: 'high', category: 'Dose', medicine: name,
        title: `${name}: above the maximum daily dose`,
        why: limit.why,
        evidence: `${m.dosage} x ${perDay} a day = ${perDose * perDay} mg/day (maximum ${limit.mg} mg/day)`,
      });
    }
    // 4. Age-related cautions
    if (age !== null && age < 12 && perDose) {
      alerts.push({ severity: 'info', category: 'Age', medicine: name, title: `${name}: child dosing`, why: 'Children need weight-based doses; adult tablet strengths may be too high.', evidence: `Patient age ${age}` });
    }
    if (age !== null && age >= 65 && m.classes.includes('nsaid')) {
      alerts.push({ severity: 'medium', category: 'Age', medicine: name, title: `${name}: NSAID in an older adult`, why: 'Older adults have a higher risk of stomach bleeding and kidney problems with NSAIDs. Use the lowest dose for the shortest time.', evidence: `Patient age ${age}` });
    }
    // 5. Already on this medicine
    const already = oldMeds.find((o) => o.drug === m.drug);
    if (already) {
      alerts.push({
        severity: 'info', category: 'Duplicate', medicine: name, title: `${name} was prescribed recently`,
        why: 'Check whether this continues the earlier course or would double the dose.',
        evidence: `Prescribed on ${new Date(already.prescribedAt).toLocaleDateString('en-GB')}`,
      });
    }
  }

  // 6. Interactions (new-new and new-current) and duplicate classes
  const pairs = [];
  newMeds.forEach((m, i) => {
    newMeds.slice(i + 1).forEach((n) => pairs.push([m, n, false]));
    oldMeds.forEach((o) => { if (o.drug !== m.drug) pairs.push([m, o, true]); });
  });
  const seen = new Set();
  for (const [x, y, withCurrent] of pairs) {
    for (const r of K.INTERACTIONS) {
      const hit = (x.classes.includes(r.a) && y.classes.includes(r.b)) || (x.classes.includes(r.b) && y.classes.includes(r.a));
      const key = `${r.title}:${[x.drug, y.drug].sort().join('+')}`;
      if (hit && !seen.has(key)) {
        seen.add(key);
        alerts.push({
          severity: r.severity, category: 'Interaction', medicine: x.medicine.name,
          title: `${r.title}: ${x.medicine.name} + ${y.medicine.name}`,
          why: r.why,
          evidence: withCurrent ? `${y.medicine.name} is already prescribed to this patient` : 'Both are on this prescription',
        });
      }
    }
    const shared = x.classes.find((c) => y.classes.includes(c));
    if (!withCurrent && shared && x.drug !== y.drug) {
      alerts.push({ severity: 'medium', category: 'Duplicate', medicine: x.medicine.name, title: `Two ${pretty(shared)}s prescribed`, why: `${x.medicine.name} and ${y.medicine.name} are both ${pretty(shared)}s. Using two together adds side effects without extra benefit.`, evidence: 'Both are on this prescription' });
    }
  }
  return sortAlerts(alerts);
}

/**
 * Risk flags for the patient profile, from lab results and medicine history.
 * @param patient     { dateOfBirth, allergies }
 * @param labRequests completed requests [{ testType:{name}, result, resultEnteredAt }]
 * @param recentMeds  distinct medicine names prescribed in the last 90 days
 */
function patientInsights({ patient = {}, labRequests = [], recentMeds = [] }) {
  const flags = [];
  const done = labRequests.filter((r) => r.result).sort((a, b) => new Date(b.resultEnteredAt || 0) - new Date(a.resultEnteredAt || 0));

  // Only the most recent result for each marker counts
  const used = new Set();
  for (const r of done) {
    for (const rule of K.LAB_RULES) {
      if (used.has(rule.marker) || !rule.test.test(r.testType?.name || '')) continue;
      const value = rule.extract(r.result);
      if (value === null || Number.isNaN(value)) continue;
      used.add(rule.marker);
      const range = rule.ranges.find((g) => (g.min !== undefined ? value >= g.min : value < g.max));
      if (range) {
        flags.push({
          severity: range.severity, category: 'Lab result', title: range.title, why: range.why,
          evidence: `${rule.marker}${rule.unit ? ` ${value} ${rule.unit}` : ''} (${r.testType.name}, ${new Date(r.resultEnteredAt || Date.now()).toLocaleDateString('en-GB')})`,
        });
      }
    }
  }
  if (recentMeds.length >= 5) {
    flags.push({ severity: 'medium', category: 'Medicines', title: 'Polypharmacy', why: 'Five or more different medicines raises the chance of interactions and side effects. Consider a medication review.', evidence: `${recentMeds.length} medicines in the last 90 days: ${recentMeds.join(', ')}` });
  }
  const age = ageOf(patient.dateOfBirth);
  if (age !== null && age >= 65 && recentMeds.length >= 3) {
    flags.push({ severity: 'info', category: 'Age', title: 'Older adult on several medicines', why: 'Kidney and liver function decline with age; doses may need adjusting.', evidence: `Age ${age}, ${recentMeds.length} recent medicines` });
  }
  return sortAlerts(flags);
}

module.exports = { analyzePrescription, patientInsights, classify, parseAllergies, mgPerDose, dosesPerDay };
