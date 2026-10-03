import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const collection = "WhatsappTemplateWabaVariant";

async function main() {
  const command = {
    createIndexes: collection,
    indexes: [
      {
        key: { templateId: 1, provider: 1, businessAccountId: 1, languageCode: 1 },
        name: "WhatsappTemplateWabaVariant_template_provider_waba_language_key",
        unique: true,
      },
      {
        key: { businessAccountId: 1, approvalStatus: 1 },
        name: "WhatsappTemplateWabaVariant_waba_approval_idx",
      },
      {
        key: { providerTemplateName: 1 },
        name: "WhatsappTemplateWabaVariant_provider_name_idx",
      },
    ],
  } as const;

  const result = await prisma.$runCommandRaw(command);
  console.log(JSON.stringify({ ok: true, collection, result }, null, 2));
}

main()
  .catch((error) => {
    console.error("Failed to ensure WhatsApp WABA indexes", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
