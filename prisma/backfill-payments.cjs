// One-off backfill: convert each existing Sale/Purchase's lump-sum paidCents
// into an initial SalePayment/PurchasePayment record, so payment history
// exists for bills recorded before the multi-payment feature. Safe to run
// more than once — skips a sale/purchase that already has payment rows.
const { PrismaClient } = require("@prisma/client");

const db = new PrismaClient();

async function main() {
  const sales = await db.sale.findMany({
    where: { paidCents: { gt: 0 } },
    include: { _count: { select: { payments: true } } },
  });
  let saleCount = 0;
  for (const sale of sales) {
    if (sale._count.payments > 0) continue;
    await db.salePayment.create({
      data: {
        saleId: sale.id,
        date: sale.date,
        amountCents: sale.paidCents,
        paymentMethod: sale.paymentMethod,
        notes: "Backfilled from existing amount paid",
      },
    });
    saleCount++;
  }
  console.log(`Backfilled ${saleCount} sale payment(s).`);

  const purchases = await db.purchase.findMany({
    where: { paidCents: { gt: 0 } },
    include: { _count: { select: { payments: true } } },
  });
  let purchaseCount = 0;
  for (const purchase of purchases) {
    if (purchase._count.payments > 0) continue;
    await db.purchasePayment.create({
      data: {
        purchaseId: purchase.id,
        date: purchase.date,
        amountCents: purchase.paidCents,
        paymentMethod: purchase.paymentMethod,
        notes: "Backfilled from existing amount paid",
      },
    });
    purchaseCount++;
  }
  console.log(`Backfilled ${purchaseCount} purchase payment(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
