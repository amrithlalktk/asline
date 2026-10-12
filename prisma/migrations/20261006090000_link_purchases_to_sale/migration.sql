-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN "linkedSaleId" TEXT;

-- CreateIndex
CREATE INDEX "Purchase_linkedSaleId_idx" ON "Purchase"("linkedSaleId");

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_linkedSaleId_fkey" FOREIGN KEY ("linkedSaleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
