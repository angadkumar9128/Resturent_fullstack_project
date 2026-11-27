import { route } from '@/shared/http/api';
import { getMenu, listBranches, resolveBranchId } from './menu.service';

export const menuRoutes = [
  route('GET', 'menu', async (ctx) => {
    const branchId = await resolveBranchId(ctx.query.get('branch') ?? undefined);
    return getMenu(branchId);
  }),
  route('GET', 'branches', async () => listBranches()),
];
