-- A combined purchase bill now has ONE bill number shared by all of its
-- supplier entries (previously each entry took its own number).

-- DropIndex
DROP INDEX "Purchase_billNumber_key";

-- Renumber existing combined bills: every entry takes the lowest number
-- in its bill, and the group's number follows. Group numbers are first
-- negated so the unique index never sees a transient clash.
UPDATE "Purchase" p
SET "billNumber" = g.min_number
FROM (
    SELECT "groupId", MIN("billNumber") AS min_number
    FROM "Purchase"
    WHERE "groupId" IS NOT NULL
    GROUP BY "groupId"
) g
WHERE p."groupId" = g."groupId";

UPDATE "PurchaseGroup" SET "number" = -"number";
UPDATE "PurchaseGroup" pg
SET "number" = (SELECT MIN(p."billNumber") FROM "Purchase" p WHERE p."groupId" = pg."id")
WHERE EXISTS (SELECT 1 FROM "Purchase" p WHERE p."groupId" = pg."id");

-- CreateIndex
CREATE INDEX "Purchase_billNumber_idx" ON "Purchase"("billNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_billNumber_partyId_key" ON "Purchase"("billNumber", "partyId");
