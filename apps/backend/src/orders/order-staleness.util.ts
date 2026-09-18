import { OrderStatus } from "@ebay-order-management/shared";

const STALE_ELIGIBLE_STATUSES: OrderStatus[] = [OrderStatus.PENDING, OrderStatus.PROCESSING, OrderStatus.SHIPPED];

export function daysInStatus(statusChangedAt: Date, now: Date = new Date()): number {
  return Math.floor((now.getTime() - new Date(statusChangedAt).getTime()) / (24 * 60 * 60 * 1000));
}

export function isOrderStale(status: OrderStatus, statusChangedAt: Date, staleOrderDays: number, now: Date = new Date()): boolean {
  if (!STALE_ELIGIBLE_STATUSES.includes(status)) return false;
  return daysInStatus(statusChangedAt, now) >= staleOrderDays;
}
