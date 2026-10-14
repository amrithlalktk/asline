-- CreateEnum
CREATE TYPE "CapitalEntryType" AS ENUM ('CONTRIBUTION', 'WITHDRAWAL');

-- CreateTable
CREATE TABLE "Partner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapitalEntry" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "type" "CapitalEntryType" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paymentMethod" TEXT NOT NULL DEFAULT 'CASH',
    "notes" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CapitalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Partner_name_key" ON "Partner"("name");

-- CreateIndex
CREATE INDEX "CapitalEntry_partnerId_idx" ON "CapitalEntry"("partnerId");

-- CreateIndex
CREATE INDEX "CapitalEntry_date_idx" ON "CapitalEntry"("date");

-- AddForeignKey
ALTER TABLE "CapitalEntry" ADD CONSTRAINT "CapitalEntry_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapitalEntry" ADD CONSTRAINT "CapitalEntry_paymentMethod_fkey" FOREIGN KEY ("paymentMethod") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapitalEntry" ADD CONSTRAINT "CapitalEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
