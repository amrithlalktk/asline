const { PrismaClient } = require("@prisma/client");

const db = new PrismaClient();

// Income is tracked via Sale now, so only expense categories are seeded.
const DEFAULT_CATEGORIES = [
  { name: "Inventory / Supplies", type: "EXPENSE" },
  { name: "Rent", type: "EXPENSE" },
  { name: "Utilities", type: "EXPENSE" },
  { name: "Salaries & Wages", type: "EXPENSE" },
  { name: "Marketing", type: "EXPENSE" },
  { name: "Equipment", type: "EXPENSE" },
  { name: "Other Expense", type: "EXPENSE" },
];

// Common additional charges added on top of a Sale/Purchase total.
const DEFAULT_CHARGE_TYPES = ["Lorry Rent", "Packing Charge", "Coolie"];

async function main() {
  for (const category of DEFAULT_CATEGORIES) {
    await db.category.upsert({
      where: { name_type: { name: category.name, type: category.type } },
      update: {},
      create: category,
    });
  }
  console.log(`Seeded ${DEFAULT_CATEGORIES.length} default categories.`);

  for (const name of DEFAULT_CHARGE_TYPES) {
    await db.chargeType.upsert({ where: { name }, update: {}, create: { name } });
  }
  console.log(`Seeded ${DEFAULT_CHARGE_TYPES.length} default charge types.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
