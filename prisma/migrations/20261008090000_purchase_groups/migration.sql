-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN "groupId" TEXT;

-- CreateTable
CREATE TABLE "PurchaseGroup" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseGroup_number_key" ON "PurchaseGroup"("number");

-- CreateIndex
CREATE INDEX "Purchase_groupId_idx" ON "Purchase"("groupId");

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PurchaseGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
