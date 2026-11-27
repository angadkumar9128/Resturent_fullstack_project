export type OrderStatusLite =
  | 'PENDING_PAYMENT'
  | 'PLACED'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'CANCELLED';

export type OrderTypeLite = 'DELIVERY' | 'TAKEAWAY' | 'DINE_IN';

export const FINAL_STATUSES: OrderStatusLite[] = ['DELIVERED', 'COMPLETED', 'CANCELLED'];

const BASE: Record<OrderStatusLite, OrderStatusLite[]> = {
  PENDING_PAYMENT: ['PLACED', 'CANCELLED'],
  PLACED: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'OUT_FOR_DELIVERY', 'CANCELLED'],
  READY: ['OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  COMPLETED: [],
  CANCELLED: [],
};

/** Allowed next statuses for an order, taking its type into account. */
export function nextStatuses(from: OrderStatusLite, type: OrderTypeLite): OrderStatusLite[] {
  return BASE[from].filter((to) => {
    if (to === 'OUT_FOR_DELIVERY') return type === 'DELIVERY';
    if (to === 'COMPLETED') return type !== 'DELIVERY';
    return true;
  });
}

export function canTransition(from: OrderStatusLite, to: OrderStatusLite, type: OrderTypeLite): boolean {
  return nextStatuses(from, type).includes(to);
}

/** Customers may only cancel before the kitchen accepts. */
export const CUSTOMER_CANCELLABLE: OrderStatusLite[] = ['PENDING_PAYMENT', 'PLACED'];
