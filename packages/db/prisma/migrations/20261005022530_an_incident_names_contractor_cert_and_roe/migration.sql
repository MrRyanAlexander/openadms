-- CreateEnum
CREATE TYPE "incident_offer" AS ENUM ('CONTRACTOR', 'CERT_NUMBER', 'ROE_NUMBER');

-- AlterTable
ALTER TABLE "form" ADD COLUMN     "incident_offers" "incident_offer"[];

-- AlterTable
ALTER TABLE "incident" ADD COLUMN     "cert_number" TEXT,
ADD COLUMN     "certification_id" UUID,
ADD COLUMN     "contractor_id" UUID,
ADD COLUMN     "roe_id" UUID,
ADD COLUMN     "roe_number" TEXT;

-- AddForeignKey
ALTER TABLE "incident" ADD CONSTRAINT "incident_project_id_contractor_id_fkey" FOREIGN KEY ("project_id", "contractor_id") REFERENCES "project_contractor"("project_id", "contractor_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "incident" ADD CONSTRAINT "incident_project_id_certification_id_fkey" FOREIGN KEY ("project_id", "certification_id") REFERENCES "certification"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "incident" ADD CONSTRAINT "incident_project_id_roe_id_fkey" FOREIGN KEY ("project_id", "roe_id") REFERENCES "roe"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
