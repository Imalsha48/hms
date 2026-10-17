# Windows MySQL stores table names in lowercase, so "prisma migrate dev" on Windows
# writes `labrequest` instead of `LabRequest`. Linux MySQL (Aiven) is case-sensitive,
# so those migrations fail in production. This script fixes the newest migration.
#
# Usage (in the server folder), for every new migration:
#   npx prisma migrate dev --create-only --name <name>
#   powershell -ExecutionPolicy Bypass -File scripts\fix-migration-case.ps1
#   npx prisma migrate dev
$models = 'User','AuditLog','Department','Doctor','DoctorSchedule','Patient','PatientDocument','Appointment','Ward','Bed','Admission','MedicalRecord','Prescription','PrescriptionItem','LabTestType','LabRequest','Medicine','MedicineBatch','Invoice','InvoiceItem','Payment','Employee','Attendance','LeaveRecord'
$dir = Get-ChildItem prisma\migrations -Directory | Sort-Object Name | Select-Object -Last 1
$file = Join-Path $dir.FullName 'migration.sql'
$sql = Get-Content $file -Raw
foreach ($m in $models) { $sql = $sql -creplace ('`' + $m.ToLower() + '`'), ('`' + $m + '`') }
[IO.File]::WriteAllText($file, $sql)
Write-Host "Fixed table-name casing in $($dir.Name)\migration.sql"
