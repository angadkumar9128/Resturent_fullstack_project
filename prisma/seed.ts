import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const branch = await prisma.branch.upsert({
    where: { slug: 'main-kitchen' },
    update: {},
    create: {
      slug: 'main-kitchen',
      name: 'Spice Garden · Main Kitchen',
      phone: '+919999999999',
      email: 'hello@example.com',
      addressLine: 'Add your restaurant address in the admin setup',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560001',
      fssaiNumber: 'UPDATE_WITH_VALID_FSSAI_NUMBER',
      gstin: 'UPDATE_WITH_VALID_GSTIN',
      hygieneRating: 'Update with verified hygiene rating',
      gstRateBps: 500,
      packagingChargePaise: 1000,
      minOrderPaise: 15000,
      openTime: '11:00',
      closeTime: '23:00',
      acceptsDelivery: true,
      acceptsTakeaway: true,
      acceptsDineIn: true,
    },
  });

  const menu = [
    { slug: 'starters', name: 'Small plates', items: [
      { slug: 'paneer-tikka', name: 'Tandoori Paneer Tikka', description: 'Smoky paneer, peppers and house spices.', diet: 'VEG' as const, price: 26900, bestseller: true },
      { slug: 'chicken-tikka', name: 'Classic Chicken Tikka', description: 'Yoghurt-marinated chicken from the tandoor.', diet: 'NON_VEG' as const, price: 32900, bestseller: true },
    ]},
    { slug: 'mains', name: 'From the kitchen', items: [
      { slug: 'dal-makhani', name: 'Dal Makhani', description: 'Slow-cooked black lentils finished with cream.', diet: 'VEG' as const, price: 28900, bestseller: true },
      { slug: 'butter-chicken', name: 'Butter Chicken', description: 'A rich tomato gravy with tandoori chicken.', diet: 'NON_VEG' as const, price: 35900, bestseller: true },
      { slug: 'veg-biryani', name: 'Vegetable Dum Biryani', description: 'Fragrant basmati rice, vegetables and whole spices.', diet: 'VEG' as const, price: 27900, bestseller: false },
    ]},
    { slug: 'breads', name: 'Breads & sides', items: [
      { slug: 'butter-naan', name: 'Butter Naan', description: 'Soft tandoor-baked bread brushed with butter.', diet: 'VEG' as const, price: 6900, bestseller: false },
      { slug: 'jeera-rice', name: 'Jeera Rice', description: 'Basmati rice tempered with cumin.', diet: 'VEG' as const, price: 14900, bestseller: false },
    ]},
  ];

  for (let index = 0; index < menu.length; index++) {
    const group = menu[index]!;
    const category = await prisma.menuCategory.upsert({
      where: { slug: group.slug },
      update: { name: group.name, sortOrder: index, isActive: true },
      create: { slug: group.slug, name: group.name, sortOrder: index },
    });
    for (let itemIndex = 0; itemIndex < group.items.length; itemIndex++) {
      const item = group.items[itemIndex]!;
      const saved = await prisma.menuItem.upsert({
        where: { slug: item.slug },
        update: { categoryId: category.id, name: item.name, description: item.description, basePricePaise: item.price, isActive: true },
        create: {
          categoryId: category.id, slug: item.slug, name: item.name, description: item.description,
          diet: item.diet, basePricePaise: item.price, isBestseller: item.bestseller,
          sortOrder: itemIndex, spiceLevel: 'MEDIUM', jainAvailable: item.diet === 'VEG',
          variants: { create: [{ name: 'Regular', pricePaise: item.price, isDefault: true, sortOrder: 0 }, { name: 'Large', pricePaise: item.price + 9000, sortOrder: 1 }] },
        },
      });
      await prisma.branchMenuItem.upsert({
        where: { branchId_itemId: { branchId: branch.id, itemId: saved.id } },
        update: { isAvailable: true },
        create: { branchId: branch.id, itemId: saved.id, isAvailable: true },
      });
    }
  }

  await prisma.diningTable.upsert({
    where: { branchId_code: { branchId: branch.id, code: 'T01' } },
    update: {},
    create: { branchId: branch.id, code: 'T01', seats: 2 },
  });
  await prisma.diningTable.upsert({
    where: { branchId_code: { branchId: branch.id, code: 'T02' } },
    update: {},
    create: { branchId: branch.id, code: 'T02', seats: 4 },
  });
  await prisma.deliveryZone.upsert({
    where: { branchId_pincode: { branchId: branch.id, pincode: '560001' } },
    update: { isActive: true },
    create: { branchId: branch.id, pincode: '560001', feePaise: 3500, etaMinutes: 40 },
  });

  const email = process.env.SEED_ADMIN_EMAIL || 'admin@example.com';
  const password = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!';
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: 'ADMIN', isActive: true },
    create: { email, name: 'Restaurant Admin', passwordHash, role: 'ADMIN', isActive: true },
  });

  console.log('Seed complete. Branch:', branch.slug, '| Admin:', email);
  console.log('IMPORTANT: replace the FSSAI/GSTIN placeholders and demo contact/address before production.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
