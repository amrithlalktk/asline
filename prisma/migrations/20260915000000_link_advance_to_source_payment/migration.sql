-- AlterTable
ALTER TABLE "PartyPayment" ADD COLUMN     "sourceSalePaymentId" TEXT,
ADD COLUMN     "sourcePurchasePaymentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "PartyPayment_sourceSalePaymentId_key" ON "PartyPayment"("sourceSalePaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "PartyPayment_sourcePurchasePaymentId_key" ON "PartyPayment"("sourcePurchasePaymentId");

-- AddForeignKey
ALTER TABLE "PartyPayment" ADD CONSTRAINT "PartyPayment_sourceSalePaymentId_fkey" FOREIGN KEY ("sourceSalePaymentId") REFERENCES "SalePayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyPayment" ADD CONSTRAINT "PartyPayment_sourcePurchasePaymentId_fkey" FOREIGN KEY ("sourcePurchasePaymentId") REFERENCES "PurchasePayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
