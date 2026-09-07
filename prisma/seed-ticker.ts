import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.liveDonationTicker.deleteMany({});

  await prisma.liveDonationTicker.create({
    data: {
      isActive: true,
      donorNames: [
        // Male
        'Ahmed', 'Mohammed', 'Muhammad', 'Mahmoud', 'Mostafa', 'Mustafa',
        'Abdullah', 'Abdelrahman', 'Abdelaziz', 'Omar', 'Umar', 'Ali',
        'Hassan', 'Hussein', 'Hamza', 'Bilal', 'Yusuf', 'Yousef',
        'Ibrahim', 'Ismail', 'Khalid', 'Walid', 'Tariq', 'Ammar',
        'Anas', 'Saad', 'Saeed', 'Salman', 'Faisal', 'Rashid',
        'Nabil', 'Karim', 'Ayman', 'Ilyas', 'Harun', 'Yahya',
        'Jamal', 'Kamal', 'Naser', 'Zubair',
        // Female
        'Fatima', 'Fatimah', 'Aisha', 'Khadija', 'Mariam', 'Maryam',
        'Asma', 'Hafsa', 'Zainab', 'Zaynab', 'Noor', 'Nur',
        'Hanan', 'Huda', 'Iman', 'Amina', 'Salma', 'Yasmin',
        'Layla', 'Nada', 'Aya', 'Malak', 'Marwa', 'Hala',
        'Rania', 'Rana', 'Bushra', 'Rahma', 'Hiba', 'Wafaa',
        'Tasneem', 'Kawthar', 'Ikram', 'Najwa',
      ],
      amountRanges: [
        { minAmount: 5,    maxAmount: 50,   probability: 60, label: 'small'      },
        { minAmount: 51,   maxAmount: 200,  probability: 30, label: 'medium'     },
        { minAmount: 201,  maxAmount: 1000, probability: 8,  label: 'large'      },
        { minAmount: 1001, maxAmount: 5000, probability: 2,  label: 'very_large' },
      ],
      minIntervalSeconds: 3,
      maxIntervalSeconds: 8,
    },
  });

  console.log('✓ Seeded live donation ticker');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
