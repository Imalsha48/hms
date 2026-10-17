/*
  Warnings:

  - You are about to drop the column `reportPath` on the `labrequest` table. All the data in the column will be lost.
  - You are about to drop the column `filePath` on the `patientdocument` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `labrequest` DROP COLUMN `reportPath`,
    ADD COLUMN `reportData` LONGBLOB NULL,
    ADD COLUMN `reportMime` VARCHAR(191) NULL,
    ADD COLUMN `reportName` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `patientdocument` DROP COLUMN `filePath`,
    ADD COLUMN `data` LONGBLOB NULL,
    ADD COLUMN `size` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `prescription` ADD COLUMN `dispensedById` INTEGER NULL;
