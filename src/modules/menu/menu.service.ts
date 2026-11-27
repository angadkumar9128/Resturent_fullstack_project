import { unstable_cache } from 'next/cache';
import type { Branch } from '@prisma/client';
import { E } from '@/shared/errors/app-error';
import { menuRepository } from './menu.repository';
import type { BranchDto, MenuDto } from './menu.types';

export function toBranchDto(b: Branch): BranchDto {
  return {
    id: b.id,
    slug: b.slug,
    name: b.name,
    phone: b.phone,
    email: b.email,
    addressLine: b.addressLine,
    city: b.city,
    state: b.state,
    pincode: b.pincode,
    latitude: b.latitude ? Number(b.latitude) : null,
    longitude: b.longitude ? Number(b.longitude) : null,
    openTime: b.openTime,
    closeTime: b.closeTime,
    acceptsDelivery: b.acceptsDelivery,
    acceptsTakeaway: b.acceptsTakeaway,
    acceptsDineIn: b.acceptsDineIn,
    fssaiNumber: b.fssaiNumber,
    gstin: b.gstin,
    hygieneRating: b.hygieneRating,
    gstRateBps: b.gstRateBps,
    packagingChargePaise: b.packagingChargePaise,
    freeDeliveryAbovePaise: b.freeDeliveryAbovePaise,
    minOrderPaise: b.minOrderPaise,
  };
}

async function buildMenu(branchId: string): Promise<MenuDto> {
  const branch = await menuRepository.findBranchBySlugOrId(branchId);
  if (!branch) throw E.notFound('Branch not found');
  const categories = await menuRepository.listCatalog(branch.id);

  return {
    branch: { id: branch.id, slug: branch.slug, name: branch.name },
    categories: categories
      .map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        items: c.items.map((i) => {
          const a = i.availability[0];
          const outOfStock = (a && !a.isAvailable) || (a?.stockQty != null && a.stockQty <= 0);
          return {
            id: i.id,
            name: i.name,
            slug: i.slug,
            description: i.description,
            imageUrl: i.imageUrl,
            diet: i.diet,
            jainAvailable: i.jainAvailable,
            spiceLevel: i.spiceLevel,
            allergens: i.allergens,
            basePricePaise: i.variants.length
              ? (i.variants.find((v) => v.isDefault) ?? i.variants[0]!).pricePaise
              : i.basePricePaise,
            isBestseller: i.isBestseller,
            available: !outOfStock,
            stockQty: a?.stockQty ?? null,
            variants: i.variants.map((v) => ({ id: v.id, name: v.name, pricePaise: v.pricePaise, isDefault: v.isDefault })),
            addonGroups: i.addonGroups
              .filter((g) => g.addons.length > 0)
              .map((g) => ({
                id: g.id,
                name: g.name,
                minSelect: g.minSelect,
                maxSelect: g.maxSelect,
                addons: g.addons.map((ad) => ({ id: ad.id, name: ad.name, pricePaise: ad.pricePaise, diet: ad.diet })),
              })),
          };
        }),
      }))
      .filter((c) => c.items.length > 0),
  };
}

/** ISR-style cache: menu is rebuilt at most once a minute, or immediately via revalidateTag('menu'). */
export const getMenu = unstable_cache(buildMenu, ['menu-v1'], { tags: ['menu'], revalidate: 60 });

async function loadBranches(): Promise<BranchDto[]> {
  const rows = await menuRepository.listActiveBranches();
  return rows.map(toBranchDto);
}
export const listBranches = unstable_cache(loadBranches, ['branches-v1'], { tags: ['branches'], revalidate: 600 });

export async function getDefaultBranchDto(): Promise<BranchDto | null> {
  const list = await listBranches();
  return list[0] ?? null;
}

/** Resolve a branch id/slug; falls back to the first active branch. */
export async function resolveBranchId(value?: string): Promise<string> {
  if (value) {
    const b = await menuRepository.findBranchBySlugOrId(value);
    if (!b) throw E.notFound('Branch not found');
    return b.id;
  }
  const d = await menuRepository.getDefaultBranch();
  if (!d) throw E.notFound('No branch is configured yet');
  return d.id;
}
