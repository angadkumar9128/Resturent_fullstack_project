export type Diet = 'VEG' | 'NON_VEG' | 'EGG';
export type SpiceLevel = 'NONE' | 'MILD' | 'MEDIUM' | 'SPICY';
export type OrderType = 'DELIVERY' | 'TAKEAWAY' | 'DINE_IN';

export interface MenuAddon {
  id: string;
  name: string;
  pricePaise: number;
  diet: Diet;
}
export interface MenuAddonGroup {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  addons: MenuAddon[];
}
export interface MenuVariant {
  id: string;
  name: string;
  pricePaise: number;
  isDefault: boolean;
}
export interface MenuItemDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  diet: Diet;
  jainAvailable: boolean;
  spiceLevel: SpiceLevel;
  allergens: string[];
  basePricePaise: number;
  isBestseller: boolean;
  available: boolean;
  stockQty: number | null;
  variants: MenuVariant[];
  addonGroups: MenuAddonGroup[];
}
export interface MenuCategoryDto {
  id: string;
  name: string;
  slug: string;
  items: MenuItemDto[];
}
export interface MenuDto {
  branch: { id: string; slug: string; name: string };
  categories: MenuCategoryDto[];
}

export interface BranchDto {
  id: string;
  slug: string;
  name: string;
  phone: string;
  email: string | null;
  addressLine: string;
  city: string;
  state: string;
  pincode: string;
  latitude: number | null;
  longitude: number | null;
  openTime: string;
  closeTime: string;
  acceptsDelivery: boolean;
  acceptsTakeaway: boolean;
  acceptsDineIn: boolean;
  fssaiNumber: string;
  gstin: string;
  hygieneRating: string | null;
  gstRateBps: number;
  packagingChargePaise: number;
  freeDeliveryAbovePaise: number | null;
  minOrderPaise: number;
}
