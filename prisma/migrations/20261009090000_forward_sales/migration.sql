-- AlterTable
ALTER TABLE "SaleItem" ADD COLUMN "forwardSaleId" TEXT;

-- CreateTable
CREATE TABLE "ForwardSale" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "partyId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "rateCents" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3),
    "notes" TEXT,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForwardSale_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ForwardSale_number_key" ON "ForwardSale"("number");

-- CreateIndex
CREATE INDEX "ForwardSale_partyId_itemId_idx" ON "ForwardSale"("partyId", "itemId");

-- CreateIndex
CREATE INDEX "SaleItem_forwardSaleId_idx" ON "SaleItem"("forwardSaleId");

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_forwardSaleId_fkey" FOREIGN KEY ("forwardSaleId") REFERENCES "ForwardSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForwardSale" ADD CONSTRAINT "ForwardSale_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForwardSale" ADD CONSTRAINT "ForwardSale_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForwardSale" ADD CONSTRAINT "ForwardSale_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
