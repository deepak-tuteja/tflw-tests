export interface Category {
  id: string;
  name: string;
  parentId: string | null;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: string;
  stock: number;
  categoryId: string;
  version: number;
}

export interface PaginatedProducts {
  data: Product[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface CartItem {
  id: string;
  cartId: string;
  productId: string;
  quantity: number;
  product: Product;
}

export interface Cart {
  id: string | null;
  items: CartItem[];
}

export type OrderStatus =
  | 'pending'
  | 'processing'
  | 'ready'
  | 'fulfilled'
  | 'cancelled'
  | 'refunded';

export interface OrderItem {
  id: string;
  productId: string;
  product: Pick<Product, 'id' | 'name'>;
  quantity: number;
  unitPrice: string;
}

export interface Order {
  id: string;
  status: OrderStatus;
  couponCode: string | null;
  discountAmount: string | null;
  createdAt: string;
  items: OrderItem[];
}

export interface Review {
  id: string;
  userId: string;
  productId: string;
  rating: number;
  comment: string;
  replyText: string | null;
  createdAt: string;
}

export interface ReviewPage {
  data: Review[];
  nextCursor: string | null;
}

export interface UploadMetadata {
  id: string;
  ownerId: string;
  filename: string;
  contentType: string;
  createdAt: string;
}

export interface Profile {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user' | 'agent';
}
