/*
  Warnings:

  - You are about to drop the column `reportPath` on the `LabRequest` table. All the data in the column will be lost.
  - You are about to drop the column `filePath` on the `PatientDocument` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `LabRequest` DROP COLUMN `reportPath`,
    ADD COLUMN `reportData` LONGBLOB NULL,
    ADD COLUMN `reportMime` VARCHAR(191) NULL,
    ADD COLUMN `reportName` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `PatientDocument` DROP COLUMN `filePath`,
    ADD COLUMN `data` LONGBLOB NULL,
    ADD COLUMN `size` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `Prescription` ADD COLUMN `dispensedById` INTEGER NULL;
