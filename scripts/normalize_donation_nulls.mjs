import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const FIELDS = ["subscriptionId", "referralId", "paidAt", "donorCountryCode"];

console.log("Before:");
for (const f of FIELDS) {
  const unset = await prisma.donation.count({ where: { [f]: { isSet: false } } });
  const nullCount = await prisma.donation.count({ where: { [f]: null } });
  console.log(`  ${f}: unset=${unset} null=${nullCount}`);
}

for (const f of FIELDS) {
  const result = await prisma.$runCommandRaw({
    update: "Donation",
    updates: [
      {
        q: { [f]: { $exists: false } },
        u: { $set: { [f]: null } },
        multi: true,
      },
    ],
  });
  console.log(`Normalized ${f}: ${JSON.stringify(result)}`);
}

console.log("After:");
for (const f of FIELDS) {
  const unset = await prisma.donation.count({ where: { [f]: { isSet: false } } });
  const nullCount = await prisma.donation.count({ where: { [f]: null } });
  console.log(`  ${f}: unset=${unset} null=${nullCount}`);
}

await prisma.$disconnect();
