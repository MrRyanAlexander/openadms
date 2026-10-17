-- CreateEnum
CREATE TYPE "photo_file" AS ENUM ('PHOTO', 'DEPTH');

-- AlterTable
ALTER TABLE "photo" ADD COLUMN     "depth_sha256" TEXT,
ADD COLUMN     "depth_uploaded_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "set_aside_file" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "photo_id" UUID NOT NULL,
    "file" "photo_file" NOT NULL,
    "device_id" UUID NOT NULL,
    "received_sha256" TEXT NOT NULL,
    "byte_count" INTEGER NOT NULL,
    "content_type" TEXT NOT NULL,
    "object_key" TEXT NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "set_aside_file_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "set_aside_file_object_key_key" ON "set_aside_file"("object_key");

-- CreateIndex
CREATE UNIQUE INDEX "set_aside_file_photo_id_file_received_sha256_key" ON "set_aside_file"("photo_id", "file", "received_sha256");

-- AddForeignKey
ALTER TABLE "set_aside_file" ADD CONSTRAINT "set_aside_file_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "photo"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "set_aside_file" ADD CONSTRAINT "set_aside_file_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "device"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
