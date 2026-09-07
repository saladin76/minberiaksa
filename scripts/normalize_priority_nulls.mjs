import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const beforePriority = await prisma.campaign.count({
  where: { priority: { isSet: false } },
});
const beforeCategoryPriority = await prisma.campaign.count({
  where: { categoryPriority: { isSet: false } },
});

console.log(`Before: priority unset=${beforePriority}, categoryPriority unset=${beforeCategoryPriority}`);

const priorityResult = await prisma.$runCommandRaw({
  update: "Campaign",
  updates: [
    {
      q: { priority: { $exists: false } },
      u: { $set: { priority: null } },
      multi: true,
    },
  ],
});
console.log("priority normalization:", JSON.stringify(priorityResult));

const categoryPriorityResult = await prisma.$runCommandRaw({
  update: "Campaign",
  updates: [
    {
      q: { categoryPriority: { $exists: false } },
      u: { $set: { categoryPriority: null } },
      multi: true,
    },
  ],
});
console.log("categoryPriority normalization:", JSON.stringify(categoryPriorityResult));

const afterPriorityUnset = await prisma.campaign.count({ where: { priority: { isSet: false } } });
const afterPriorityNull = await prisma.campaign.count({ where: { priority: null } });
const afterCatPriorityUnset = await prisma.campaign.count({ where: { categoryPriority: { isSet: false } } });
const afterCatPriorityNull = await prisma.campaign.count({ where: { categoryPriority: null } });

console.log(`After: priority unset=${afterPriorityUnset}, priority null=${afterPriorityNull}`);
console.log(`After: categoryPriority unset=${afterCatPriorityUnset}, categoryPriority null=${afterCatPriorityNull}`);

await prisma.$disconnect();
