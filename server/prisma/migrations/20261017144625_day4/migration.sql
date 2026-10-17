-- AlterTable
ALTER TABLE `Admission` ADD COLUMN `invoiceId` INTEGER NULL;

-- AlterTable
ALTER TABLE `Appointment` ADD COLUMN `invoiceId` INTEGER NULL;

-- AlterTable
ALTER TABLE `Invoice` ADD COLUMN `createdById` INTEGER NULL,
    ADD COLUMN `discount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `notes` VARCHAR(191) NULL,
    ADD COLUMN `subtotal` DECIMAL(12, 2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `LabRequest` ADD COLUMN `invoiceId` INTEGER NULL;

-- AlterTable
ALTER TABLE `Prescription` ADD COLUMN `invoiceId` INTEGER NULL;

-- CreateIndex
CREATE INDEX `Invoice_createdAt_idx` ON `Invoice`(`createdAt`);

-- CreateIndex
CREATE INDEX `Payment_paidAt_idx` ON `Payment`(`paidAt`);

-- AddForeignKey
ALTER TABLE `Appointment` ADD CONSTRAINT `Appointment_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Admission` ADD CONSTRAINT `Admission_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Prescription` ADD CONSTRAINT `Prescription_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LabRequest` ADD CONSTRAINT `LabRequest_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
