export interface ReservationItemResult {
  productId: string;
  requestedQuantity: number;
  reservedQuantity: number;
  backorderId: string | null;
}

export interface ReservationResult {
  orderId: string | null;
  fullyReserved: boolean;
  items: ReservationItemResult[];
}
