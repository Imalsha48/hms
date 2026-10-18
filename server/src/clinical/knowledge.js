// =============================================================
// Clinical knowledge base for decision support (spec 12: AI-Based Decision Support)
// Rules are kept as DATA, separate from the code that applies them, so a clinician
// can review or extend them without touching the logic. Every rule carries a short
// explanation that is shown to the user, so each alert says WHY it fired.
//
// NOTE: a demonstration rule set for a student project, not a validated clinical
// reference. A real deployment would use a maintained drug database.
// =============================================================

// Drug classes: medicine names (generic) that belong to each class
const DRUG_CLASSES = {
  penicillin: ['amoxicillin', 'ampicillin', 'penicillin', 'flucloxacillin', 'cloxacillin', 'co-amoxiclav', 'piperacillin', 'benzylpenicillin', 'phenoxymethylpenicillin'],
  cephalosporin: ['cefalexin', 'cephalexin', 'cefuroxime', 'ceftriaxone', 'cefixime', 'cefadroxil', 'cefotaxime'],
  sulfonamide: ['sulfamethoxazole', 'co-trimoxazole', 'cotrimoxazole', 'sulfasalazine', 'sulfadiazine'],
  macrolide: ['azithromycin', 'clarithromycin', 'erythromycin'],
  nsaid: ['ibuprofen', 'diclofenac', 'naproxen', 'aspirin', 'mefenamic acid', 'celecoxib', 'ketorolac', 'indomethacin'],
  statin: ['atorvastatin', 'simvastatin', 'rosuvastatin', 'pravastatin'],
  anticoagulant: ['warfarin', 'apixaban', 'rivaroxaban', 'dabigatran', 'heparin'],
  ace_inhibitor: ['enalapril', 'lisinopril', 'captopril', 'ramipril', 'perindopril'],
  potassium_sparing: ['spironolactone', 'amiloride', 'eplerenone'],
  nonselective_beta_blocker: ['propranolol', 'nadolol', 'timolol', 'sotalol'],
  beta_agonist: ['salbutamol', 'albuterol', 'terbutaline', 'salmeterol'],
  opioid: ['tramadol', 'codeine', 'morphine', 'oxycodone'],
  benzodiazepine: ['diazepam', 'lorazepam', 'alprazolam', 'clonazepam'],
};

// Words a patient/receptionist might type in the allergy field -> the class they mean
const ALLERGY_TERMS = {
  penicillin: 'penicillin', penicillins: 'penicillin', amoxicillin: 'penicillin', amoxil: 'penicillin', augmentin: 'penicillin',
  cephalosporin: 'cephalosporin', cephalosporins: 'cephalosporin',
  sulfa: 'sulfonamide', sulpha: 'sulfonamide', sulfonamide: 'sulfonamide', sulphonamide: 'sulfonamide', bactrim: 'sulfonamide',
  nsaid: 'nsaid', nsaids: 'nsaid', aspirin: 'nsaid', ibuprofen: 'nsaid', brufen: 'nsaid',
  macrolide: 'macrolide', erythromycin: 'macrolide',
  codeine: 'opioid', morphine: 'opioid', opioid: 'opioid',
};

// Cross-reactivity: allergy to A means some risk with B
const CROSS_REACTIVITY = [
  {
    allergyClass: 'penicillin', drugClass: 'cephalosporin', severity: 'medium',
    why: 'A small proportion of people allergic to penicillins also react to cephalosporins (similar beta-lactam structure).',
  },
];

// Drug-drug interactions between classes (or specific drugs)
const INTERACTIONS = [
  { a: 'anticoagulant', b: 'nsaid', severity: 'high', title: 'Bleeding risk', why: 'NSAIDs affect platelets and the stomach lining; with an anticoagulant the risk of serious bleeding rises sharply.' },
  { a: 'macrolide', b: 'statin', severity: 'medium', title: 'Statin levels raised', why: 'Clarithromycin and erythromycin slow statin breakdown, increasing the risk of muscle damage (myopathy). Consider pausing the statin or using azithromycin.' },
  { a: 'ace_inhibitor', b: 'potassium_sparing', severity: 'medium', title: 'High potassium risk', why: 'Both raise blood potassium; together they can cause hyperkalaemia. Monitor potassium.' },
  { a: 'nonselective_beta_blocker', b: 'beta_agonist', severity: 'medium', title: 'Reduced bronchodilator effect', why: 'Non-selective beta blockers block the effect of salbutamol-type inhalers and can trigger bronchospasm in asthma.' },
  { a: 'opioid', b: 'benzodiazepine', severity: 'high', title: 'Breathing suppression', why: 'Both depress breathing; combined use can cause dangerous sedation and respiratory depression.' },
  { a: 'ace_inhibitor', b: 'nsaid', severity: 'medium', title: 'Kidney function', why: 'NSAIDs reduce the blood-pressure effect of ACE inhibitors and together can harm kidney function, especially in older patients.' },
];

// Maximum daily dose for adults, in mg
const MAX_DAILY_MG = {
  paracetamol: { mg: 4000, why: 'More than 4 g of paracetamol a day risks liver damage.' },
  ibuprofen: { mg: 2400, why: 'Ibuprofen above 2400 mg/day increases stomach bleeding and heart risks.' },
  diclofenac: { mg: 150, why: 'Diclofenac above 150 mg/day raises cardiovascular and stomach risks.' },
  metformin: { mg: 2550, why: 'Metformin above about 2.5 g/day adds side effects without extra benefit.' },
  atorvastatin: { mg: 80, why: 'The licensed maximum for atorvastatin is 80 mg/day.' },
  amoxicillin: { mg: 3000, why: 'Usual adult maximum is 3 g/day for common infections.' },
  aspirin: { mg: 4000, why: 'High-dose aspirin increases bleeding and toxicity risk.' },
};

// How many doses per day each frequency means
const FREQUENCY_PER_DAY = [
  [/once|daily|od\b|at night|nocte|morning/i, 1],
  [/twice|bd\b|bid\b|2 times|two times/i, 2],
  [/3 times|three times|tds\b|tid\b/i, 3],
  [/4 times|four times|qds\b|qid\b/i, 4],
];

// Lab result rules. `extract` pulls a number out of the free-text result.
// Thresholds follow common adult reference ranges.
const num = (re) => (text) => {
  const m = String(text || '').match(re);
  const v = m && m.slice(1).find((x) => x !== undefined);
  return v === undefined || v === null ? null : parseFloat(v);
};
const LAB_RULES = [
  { test: /fasting blood sugar|fbs/i, marker: 'Fasting glucose', unit: 'mg/dL', extract: num(/(\d+(?:\.\d+)?)\s*mg\/dl/i),
    ranges: [
      { min: 126, severity: 'high', title: 'Fasting glucose in diabetes range', why: 'Fasting glucose of 126 mg/dL or more is in the diabetes range (ADA criteria). Confirm with a repeat test or HbA1c.' },
      { min: 100, severity: 'medium', title: 'Impaired fasting glucose', why: 'Fasting glucose 100-125 mg/dL suggests prediabetes. Advise lifestyle changes and re-test.' },
    ] },
  { test: /lipid/i, marker: 'Total cholesterol', unit: 'mg/dL', extract: num(/total\s*cholesterol\s*(\d+(?:\.\d+)?)/i),
    ranges: [
      { min: 240, severity: 'high', title: 'High total cholesterol', why: 'Total cholesterol of 240 mg/dL or more is high and raises cardiovascular risk.' },
      { min: 200, severity: 'medium', title: 'Borderline high cholesterol', why: 'Total cholesterol 200-239 mg/dL is borderline high.' },
    ] },
  { test: /lipid/i, marker: 'LDL cholesterol', unit: 'mg/dL', extract: num(/ldl\s*(\d+(?:\.\d+)?)/i),
    ranges: [
      { min: 190, severity: 'high', title: 'Very high LDL', why: 'LDL of 190 mg/dL or more usually warrants statin therapy.' },
      { min: 160, severity: 'medium', title: 'High LDL', why: 'LDL 160-189 mg/dL is high.' },
    ] },
  { test: /liver function|lft/i, marker: 'ALT', unit: 'U/L', extract: num(/alt\s*(\d+(?:\.\d+)?)/i),
    ranges: [
      { min: 120, severity: 'high', title: 'ALT more than 3x normal', why: 'ALT above about 3 times the upper limit (~40 U/L) suggests significant liver injury.' },
      { min: 41, severity: 'medium', title: 'Raised ALT', why: 'ALT above ~40 U/L indicates liver inflammation. Review medicines and alcohol use.' },
    ] },
  { test: /full blood count|fbc|cbc/i, marker: 'Platelets', unit: 'x10^9/L', extract: num(/platelets?\s*(\d+(?:\.\d+)?)/i),
    ranges: [
      { max: 100, severity: 'high', title: 'Low platelets', why: 'Platelets below 100 x10^9/L increase bleeding risk (watch for dengue in Sri Lanka). Avoid NSAIDs and aspirin.' },
      { max: 150, severity: 'medium', title: 'Mildly low platelets', why: 'Platelets below 150 x10^9/L are below the normal range.' },
    ] },
  { test: /full blood count|fbc|cbc/i, marker: 'White cells', unit: 'x10^9/L', extract: num(/wbc\s*(\d+(?:\.\d+)?)/i),
    ranges: [{ min: 11, severity: 'medium', title: 'Raised white cell count', why: 'WBC above 11 x10^9/L can indicate infection or inflammation.' }] },
  { test: /full blood count|fbc|cbc/i, marker: 'Haemoglobin', unit: 'g/dL', extract: num(/h(?:a)?emoglobin\s*(\d+(?:\.\d+)?)|hb\s*(\d+(?:\.\d+)?)/i),
    ranges: [{ max: 12, severity: 'medium', title: 'Low haemoglobin (anaemia)', why: 'Haemoglobin below 12 g/dL is below the normal adult range.' }] },
  { test: /urine/i, marker: 'Nitrites', unit: '', extract: (t) => (/nitrites?\s*positive/i.test(t || '') ? 1 : null),
    ranges: [{ min: 1, severity: 'medium', title: 'Possible urinary tract infection', why: 'Positive nitrites usually mean bacteria in the urine.' }] },
];

module.exports = { DRUG_CLASSES, ALLERGY_TERMS, CROSS_REACTIVITY, INTERACTIONS, MAX_DAILY_MG, FREQUENCY_PER_DAY, LAB_RULES };
