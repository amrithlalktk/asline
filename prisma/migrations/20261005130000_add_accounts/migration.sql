-- Payment methods become real accounts (cash + any number of bank accounts)
-- with opening balances. Each paymentMethod column switches from the fixed
-- enum to a reference to Account.id; existing values keep their meaning by
-- seeding accounts whose ids are the old enum values.

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('CASH', 'BANK');

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL DEFAULT 'BANK',
    "openingBalanceCents" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_name_key" ON "Account"("name");

-- Convert enum columns to text (values unchanged)
ALTER TABLE "Transaction" ALTER COLUMN "paymentMethod" TYPE TEXT USING "paymentMethod"::text;
ALTER TABLE "PartyPayment" ALTER COLUMN "paymentMethod" DROP DEFAULT;
ALTER TABLE "PartyPayment" ALTER COLUMN "paymentMethod" TYPE TEXT USING "paymentMethod"::text;
ALTER TABLE "PartyPayment" ALTER COLUMN "paymentMethod" SET DEFAULT 'CASH';
ALTER TABLE "Sale" ALTER COLUMN "paymentMethod" DROP DEFAULT;
ALTER TABLE "Sale" ALTER COLUMN "paymentMethod" TYPE TEXT USING "paymentMethod"::text;
ALTER TABLE "Sale" ALTER COLUMN "paymentMethod" SET DEFAULT 'CASH';
ALTER TABLE "SalePayment" ALTER COLUMN "paymentMethod" DROP DEFAULT;
ALTER TABLE "SalePayment" ALTER COLUMN "paymentMethod" TYPE TEXT USING "paymentMethod"::text;
ALTER TABLE "SalePayment" ALTER COLUMN "paymentMethod" SET DEFAULT 'CASH';
ALTER TABLE "Purchase" ALTER COLUMN "paymentMethod" DROP DEFAULT;
ALTER TABLE "Purchase" ALTER COLUMN "paymentMethod" TYPE TEXT USING "paymentMethod"::text;
ALTER TABLE "Purchase" ALTER COLUMN "paymentMethod" SET DEFAULT 'CASH';
ALTER TABLE "PurchasePayment" ALTER COLUMN "paymentMethod" DROP DEFAULT;
ALTER TABLE "PurchasePayment" ALTER COLUMN "paymentMethod" TYPE TEXT USING "paymentMethod"::text;
ALTER TABLE "PurchasePayment" ALTER COLUMN "paymentMethod" SET DEFAULT 'CASH';

-- DropEnum
DROP TYPE "PaymentMethod";

-- Seed accounts: Cash and Bank always; the other legacy methods only if
-- some record already uses them.
INSERT INTO "Account" ("id", "name", "type") VALUES
    ('CASH', 'Cash', 'CASH'),
    ('BANK', 'Bank', 'BANK');
INSERT INTO "Account" ("id", "name", "type")
SELECT v.id, v.name, 'BANK'::"AccountType"
FROM (VALUES ('IDBI_BANK', 'IDBI Bank'), ('INDUSIND_BANK', 'IndusInd Bank'), ('GPAY', 'GPay')) AS v(id, name)
WHERE EXISTS (SELECT 1 FROM "Transaction" WHERE "paymentMethod" = v.id)
   OR EXISTS (SELECT 1 FROM "PartyPayment" WHERE "paymentMethod" = v.id)
   OR EXISTS (SELECT 1 FROM "Sale" WHERE "paymentMethod" = v.id)
   OR EXISTS (SELECT 1 FROM "SalePayment" WHERE "paymentMethod" = v.id)
   OR EXISTS (SELECT 1 FROM "Purchase" WHERE "paymentMethod" = v.id)
   OR EXISTS (SELECT 1 FROM "PurchasePayment" WHERE "paymentMethod" = v.id);

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_paymentMethod_fkey" FOREIGN KEY ("paymentMethod") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartyPayment" ADD CONSTRAINT "PartyPayment_paymentMethod_fkey" FOREIGN KEY ("paymentMethod") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_paymentMethod_fkey" FOREIGN KEY ("paymentMethod") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalePayment" ADD CONSTRAINT "SalePayment_paymentMethod_fkey" FOREIGN KEY ("paymentMethod") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_paymentMethod_fkey" FOREIGN KEY ("paymentMethod") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchasePayment" ADD CONSTRAINT "PurchasePayment_paymentMethod_fkey" FOREIGN KEY ("paymentMethod") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
