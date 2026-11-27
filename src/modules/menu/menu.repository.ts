import { prisma } from '@/shared/db/prisma';

export const menuRepository = {
  listActiveBranches() {
    return prisma.branch.findMany({ where: { isActive: true }, orderBy: { createdAt: 'asc' } });
  },

  async getDefaultBranch() {
    return prisma.branch.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } });
  },

  findBranchBySlugOrId(value: string) {
    return prisma.branch.findFirst({ where: { isActive: true, OR: [{ id: value }, { slug: value }] } });
  },

  listCatalog(branchId: string) {
    return prisma.menuCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        items: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          include: {
            variants: { orderBy: { sortOrder: 'asc' } },
            addonGroups: {
              orderBy: { sortOrder: 'asc' },
              include: { addons: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
            },
            availability: { where: { branchId } },
          },
        },
      },
    });
  },
};
