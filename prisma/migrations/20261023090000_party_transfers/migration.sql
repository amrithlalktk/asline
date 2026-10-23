-- AlterTable
ALTER TABLE "PartyPayment" ADD COLUMN     "partyTransferId" TEXT;

-- CreateTable
CREATE TABLE "PartyTransfer" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "fromPartyId" TEXT NOT NULL,
    "toPartyId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "notes" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartyTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PartyTransfer_date_idx" ON "PartyTransfer"("date");

-- AddForeignKey
ALTER TABLE "PartyPayment" ADD CONSTRAINT "PartyPayment_partyTransferId_fkey" FOREIGN KEY ("partyTransferId") REFERENCES "PartyTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyTransfer" ADD CONSTRAINT "PartyTransfer_fromPartyId_fkey" FOREIGN KEY ("fromPartyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyTransfer" ADD CONSTRAINT "PartyTransfer_toPartyId_fkey" FOREIGN KEY ("toPartyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyTransfer" ADD CONSTRAINT "PartyTransfer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- The no-cash account both sides of a party transfer are booked against.
-- Its ins and outs always cancel, so it stays at zero and is hidden from
-- account lists (see PARTY_TRANSFER_ACCOUNT_ID).
INSERT INTO "Account" ("id", "name", "type", "openingBalanceCents", "active", "createdAt")
VALUES ('PARTY_TRANSFER', 'Party transfer (no cash)', 'CASH', 0, false, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;
