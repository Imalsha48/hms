const assert=require('assert');const D=require('../src/clinical/decisionSupport');
const med=(name,extra={})=>({id:name,name,...extra});
const adult={dateOfBirth:'1985-03-12'};
const titles=(a)=>a.map(x=>`${x.severity}:${x.title}`);
// 1 penicillin allergy + amoxicillin -> HIGH allergy
let a=D.analyzePrescription({patient:{...adult,allergies:'Penicillin (rash)'},items:[{medicine:med('Amoxicillin 250mg'),dosage:'1 capsule',frequency:'3 times a day'}]});
assert.strictEqual(a[0].severity,'high');assert.strictEqual(a[0].category,'Allergy');assert(a[0].why.includes('penicillin'));
// 2 penicillin allergy + cefalexin -> MEDIUM cross reaction, not high
a=D.analyzePrescription({patient:{...adult,allergies:'penicillin'},items:[{medicine:med('Cefalexin 500mg'),dosage:'1',frequency:'4 times a day'}]});
assert.deepStrictEqual(a.map(x=>x.severity),['medium']);
// 3 no allergy, normal paracetamol -> no alerts
a=D.analyzePrescription({patient:adult,items:[{medicine:med('Paracetamol 500mg'),dosage:'1 tablet',frequency:'3 times a day'}]});
assert.strictEqual(a.length,0);
// 4 paracetamol 2 tablets x 4 = 4000 -> not above; 3 tablets x 4 = 6000 -> HIGH
assert.strictEqual(D.analyzePrescription({patient:adult,items:[{medicine:med('Paracetamol 500mg'),dosage:'2 tablets',frequency:'4 times a day'}]}).length,0);
a=D.analyzePrescription({patient:adult,items:[{medicine:med('Paracetamol 500mg'),dosage:'3 tablets',frequency:'4 times a day'}]});
assert.strictEqual(a[0].category,'Dose');assert(a[0].evidence.includes('6000 mg/day'));
// 5 interaction with CURRENT medicine: on warfarin, prescribe ibuprofen -> HIGH bleeding
a=D.analyzePrescription({patient:adult,items:[{medicine:med('Ibuprofen 400mg'),dosage:'1',frequency:'3 times a day'}]},);
a=D.analyzePrescription({patient:adult,items:[{medicine:med('Ibuprofen 400mg'),dosage:'1',frequency:'3 times a day'}],current:[{medicine:med('Warfarin 5mg'),prescribedAt:'2026-10-10'}]});
assert(a.some(x=>x.severity==='high'&&x.category==='Interaction'&&x.evidence.includes('already prescribed')));
// 6 two NSAIDs together -> duplicate therapy
a=D.analyzePrescription({patient:adult,items:[{medicine:med('Ibuprofen 400mg'),dosage:'1',frequency:'twice a day'},{medicine:med('Diclofenac 50mg'),dosage:'1',frequency:'twice a day'}]});
assert(a.some(x=>x.title==='Two nsaids prescribed'));
// 7 clarithromycin + atorvastatin -> medium interaction (order independent)
a=D.analyzePrescription({patient:adult,items:[{medicine:med('Atorvastatin 10mg'),dosage:'1',frequency:'At night'},{medicine:med('Clarithromycin 500mg'),dosage:'1',frequency:'twice a day'}]});
assert(a.some(x=>x.category==='Interaction'&&x.severity==='medium'));
// 8 elderly + NSAID -> medium age caution ; child -> info
assert(D.analyzePrescription({patient:{dateOfBirth:'1945-01-01'},items:[{medicine:med('Ibuprofen 200mg'),dosage:'1',frequency:'twice a day'}]}).some(x=>x.category==='Age'&&x.severity==='medium'));
assert(D.analyzePrescription({patient:{dateOfBirth:'2019-01-01'},items:[{medicine:med('Paracetamol 500mg'),dosage:'1',frequency:'3 times a day'}]}).some(x=>x.severity==='info'));
// 9 syrup (ml) -> no dose calc crash
assert.strictEqual(D.mgPerDose(med('Salbutamol Syrup'),'5 ml'),null);
// 10 "sulfa" allergy -> co-trimoxazole high ; NSAID allergy "aspirin" -> ibuprofen high
assert(D.analyzePrescription({patient:{allergies:'Sulfa drugs'},items:[{medicine:med('Co-trimoxazole 480mg'),dosage:'2',frequency:'twice a day'}]})[0].severity==='high');
assert(D.analyzePrescription({patient:{allergies:'aspirin'},items:[{medicine:med('Ibuprofen 400mg'),dosage:'1',frequency:'twice'}]})[0].category==='Allergy');
// 11 same drug already prescribed -> info duplicate, not interaction with itself
a=D.analyzePrescription({patient:adult,items:[{medicine:med('Metformin 500mg'),dosage:'1',frequency:'Twice a day'}],current:[{medicine:med('Metformin 500mg'),prescribedAt:'2026-10-12'}]});
assert.deepStrictEqual(a.map(x=>x.category),['Duplicate']);
// --- insights from lab results (demo seed result texts)
const lab=(name,result,d='2026-10-10')=>({testType:{name},result,resultEnteredAt:d});
let f=D.patientInsights({patient:adult,labRequests:[lab('Fasting Blood Sugar','142 mg/dL (high)'),lab('Lipid Profile','Total cholesterol 238 mg/dL, LDL 160 mg/dL, HDL 42 mg/dL'),lab('Liver Function Test','ALT 88 U/L, AST 74 U/L'),lab('Full Blood Count','WBC 11.2 x10^9/L (slightly high), Hb 13.1 g/dL, Platelets 210 x10^9/L'),lab('Urine Full Report','Pus cells 15-20/HPF, nitrites positive')]});

assert(f[0].title.includes('diabetes range'));
assert(f.some(x=>x.title==='Borderline high cholesterol')&&f.some(x=>x.title==='High LDL')&&f.some(x=>x.title==='Raised ALT'));
assert(f.some(x=>x.title==='Raised white cell count')&&!f.some(x=>/platelets|haemoglobin/i.test(x.title)));
assert(f.some(x=>x.title.includes('urinary')));
// newest result wins: older high FBS, newer normal FBS -> no flag
f=D.patientInsights({labRequests:[lab('Fasting Blood Sugar','150 mg/dL','2026-10-01'),lab('Fasting Blood Sugar','92 mg/dL','2026-10-15')]});
assert.strictEqual(f.length,0);
// dengue-like low platelets -> high ; low Hb via "Hb" -> medium
f=D.patientInsights({labRequests:[lab('Full Blood Count','WBC 3.1, Hb 10.5 g/dL, Platelets 62 x10^9/L')]});
assert(f[0].severity==='high'&&f[0].title==='Low platelets');assert(f.some(x=>x.title.includes('anaemia')));
assert(D.patientInsights({recentMeds:['a','b','c','d','e']}).some(x=>x.title==='Polypharmacy'));
console.log('decision support tests passed (11 prescription + 5 insight scenarios)');
