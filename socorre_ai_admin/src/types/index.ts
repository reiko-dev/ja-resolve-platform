export interface User {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: 'user' | 'partner' | 'admin';
  cpf?: string;
  cnpj?: string;
  is_active: boolean;
  email_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: number;
  name: string;
  description: string;
  icon: string;
  color: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface DashboardStats {
  // Usuários
  totalUsers: number;
  totalPartners: number;
  activeUsers: number;
  
  // Parceiros (nova estrutura)
  totalPartnersNew: number;
  totalMechanics: number;
  totalMotoboys: number;
  totalStores: number;
  totalGasStations: number;
  totalAutoParts: number;
  verifiedPartners: number;
  availablePartners: number;
  onlinePartners: number;
  averagePartnerRating: string;
  
  // Serviços
  totalServices: number;
  availableServices: number;
  
  // Solicitações de emergência (nova lógica)
  totalEmergencyRequests: number;
  pendingEmergencyRequests: number;
  acceptedEmergencyRequests: number;
  completedEmergencyRequests: number;
  inProgressEmergencyRequests: number;
  
  averageProposalResponseTime: number;
  proposalSuccessRate: number;
  
  // Ordens de delivery (nova lógica)
  totalDeliveryOrders: number;
  pendingDeliveryOrders: number;
  acceptedDeliveryOrders: number;
  pickedUpDeliveryOrders: number;
  inTransitDeliveryOrders: number;
  deliveredDeliveryOrders: number;
  cancelledDeliveryOrders: number;
  averageDeliveryTime: number;
  deliverySuccessRate: number;
  deliveredOrders: number; // Adicionado para compatibilidade
  
  // Assinaturas (novo)
  totalSubscriptions: number;
  activeSubscriptions: number;
  expiredSubscriptions: number;
  cancelledSubscriptions: number;
  pendingPaymentSubscriptions: number;
  expiringSoonSubscriptions: number;
  
  // Produtos (novo)
  totalProducts: number;
  activeProducts: number;
  lowStockProducts: number;
  outOfStockProducts: number;
  featuredProducts: number;
  
  // Pedidos de compra (legado)
  totalPurchaseOrders: number;
  pendingPurchaseOrders: number;
  deliveredPurchaseOrders: number;
  
  // Agendamentos (legado)
  totalAppointments: number;
  pendingAppointments: number;
  completedAppointments: number;
  inProgressAppointments: number;
  
  // Avaliações
  totalReviews: number;
  verifiedReviews: number;
  
  // Receita (nova estrutura)
  totalRevenue: number;
  emergencyRevenue: number;
  deliveryRevenue: number;
  purchaseRevenue: number;
  subscriptionRevenue: number;
  proposalRevenue: number;
  productRevenue: number;
  
  // Métricas calculadas
  emergencyCompletionRate: number;
  deliveryCompletionRate: number;
  purchaseCompletionRate: number;
  partnerVerificationRate: number;
  partnerOnlineRate: number;
  
  // Novas métricas
  averageProposalValue: number;
  averageDeliveryValue: number;
  averageSubscriptionValue: number;
  partnerSatisfactionScore: number;
  systemHealthScore: number;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  data?: {
    user: User;
    token: string;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;
}

export interface PaginatedResponse<T> {
  success: boolean;
  message: string;
  data: {
    users?: T[];
    items?: T[];
    partners?: T[];
    requests?: T[];
    orders?: T[];
    subscriptions?: T[];
    products?: T[];
    proposals?: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    pagination?: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  };
}

// Novas interfaces para as entidades da nova arquitetura
export interface Partner {
  id: number;
  user_id: number;
  user_name?: string;
  user_email?: string;
  type: 'mechanic' | 'motoboy' | 'gas_station' | 'auto_parts' | 'tow';
  business_name: string;
  description?: string;
  specialties?: string[];
  address: string;
  latitude?: number;
  longitude?: number;
  phone: string;
  whatsapp?: string;
  website?: string;
  instagram?: string;
  facebook?: string;
  hourly_rate?: number;
  service_fee?: number;
  delivery_fee?: number;
  is_verified: boolean;
  is_available: boolean;
  is_online: boolean;
  working_hours?: any;
  payment_methods?: string[];
  service_areas?: string[];
  experience_years?: number;
  certifications?: string[];
  insurance_info?: string;
  warranty_info?: string;
  emergency_service: boolean;
  home_service: boolean;
  workshop_service: boolean;
  delivery_service: boolean;
  service_radius: number;
  delivery_radius: number;
  vehicle_type?: string;
  license_plate?: string;
  cnh_number?: string;
  cnh_category?: string;
  store_categories?: string[];
  has_delivery: boolean;
  min_order_value?: number;
  delivery_time_minutes?: number;
  rating: number;
  total_reviews: number;
  total_services: number;
  total_emergencies: number;
  total_deliveries: number;
  total_sales: number;
  created_at: string;
  updated_at: string;
}

export interface EmergencyRequest {
  id: number;
  user_id: number;
  type: 'mechanical' | 'fuel' | 'tire' | 'battery' | 'other';
  request_type: 'mechanic' | 'tow' | 'fuel' | 'battery';
  description: string;
  photos?: string[];
  vehicle_info?: any;
  vehicle_plate?: string;
  vehicle_model?: string;
  vehicle_year?: string;
  vehicle_color?: string;
  location_type: 'roadside' | 'parking' | 'home' | 'other';
  latitude: number;
  longitude: number;
  address: string;
  landmarks?: string;
  status: 'pending' | 'accepted' | 'in_progress' | 'completed' | 'cancelled' | 'expired';
  partner_id?: number;
  accepted_by?: number;
  estimated_price?: number;
  final_price?: number;
  price_breakdown?: any;
  accepted_at?: string;
  started_at?: string;
  completed_at?: string;
  estimated_duration_minutes?: number;
  actual_duration_minutes?: number;
  notes?: string;
  solution_description?: string;
  parts_used?: any;
  warranty_info?: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  is_urgent: boolean;
  rating?: number;
  review_comment?: string;
  reviewed_at?: string;
  view_count: number;
  response_count: number;
  created_at: string;
  updated_at: string;
  user_name?: string;
  user_phone?: string;
  partner_name?: string;
  partner_phone?: string;
  accepted_proposal_id?: string;
}

export interface DeliveryOrder {
  id: number;
  order_type: 'fuel' | 'auto_parts';
  type: 'fuel' | 'auto_parts'; // Adicionado para compatibilidade
  store_id: number;
  store_name: string;
  customer_id: number;
  user_name?: string; // Adicionado para compatibilidade
  user_phone?: string; // Adicionado para compatibilidade
  motoboy_id?: number;
  motoboy_name?: string;
  motoboy_phone?: string; // Adicionado para compatibilidade
  pickup_address: string;
  pickup_latitude: number;
  pickup_longitude: number;
  pickup_instructions?: string; // Adicionado para compatibilidade
  delivery_address: string;
  delivery_latitude: number;
  delivery_longitude: number;
  delivery_instructions?: string; // Adicionado para compatibilidade
  items: OrderItem[];
  items_description?: string; // Adicionado para compatibilidade
  items_price?: number; // Adicionado para compatibilidade
  items_total: number;
  items_count: number;
  delivery_fee: number;
  platform_fee: number;
  motoboy_fee: number;
  total_amount: number;
  total_price?: number; // Adicionado para compatibilidade
  status: 'pending' | 'accepted' | 'cancelled' | 'picked_up' | 'in_transit' | 'delivered' | 'failed';
  accepted_at?: string;
  picked_up_at?: string;
  in_transit_at?: string;
  delivered_at?: string;
  estimated_time_minutes?: number;
  estimated_delivery_minutes?: number; // Adicionado para compatibilidade
  actual_time_minutes?: number;
  actual_delivery_minutes?: number; // Adicionado para compatibilidade
  urgency?: 'low' | 'medium' | 'high' | 'critical'; // Adicionado para compatibilidade
  is_urgent?: boolean; // Adicionado para compatibilidade
  customer_notes?: string;
  motoboy_notes?: string;
  cancellation_reason?: string;
  payment_status: 'pending' | 'failed' | 'paid' | 'refunded';
  tracking_history?: TrackingPoint[];
  distance_km?: number;
  rating?: number;
  review_comment?: string;
  reviewed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  product_id: number;
  name: string;
  price: number;
  quantity: number;
  total: number;
}

export interface TrackingPoint {
  timestamp: string;
  latitude: number;
  longitude: number;
  status?: string;
}

export interface Subscription {
  id: number;
  partner_id: number;
  partner_name: string;
  type: 'mechanic' | 'gas_station' | 'auto_parts';
  status: 'active' | 'expired' | 'cancelled' | 'pending_payment' | 'suspended';
  monthly_fee: number;
  start_date: string;
  end_date: string;
  due_date?: string;
  cancelled_at?: string;
  cancellation_reason?: string;
  auto_renew: boolean;
  payment_method?: string;
  last_payment_at?: string;
  last_payment_amount?: number;
  failed_payment_attempts?: number;
  next_billing_date?: string;
  features?: any;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: number;
  store_id: number;
  store_name: string;
  sku: string;
  name: string;
  description: string;
  category: 'fuel' | 'oil' | 'tire' | 'battery' | 'brake' | 'filter' | 'light' | 'accessory' | 'tool' | 'fluid' | 'part' | 'other';
  type: 'fuel' | 'auto_part' | 'accessory' | 'tool' | 'fluid' | 'other';
  price: number;
  stock: number;
  unit?: string;
  brand?: string;
  tags?: string[];
  photos?: string[];
  is_active: boolean;
  is_featured: boolean;
  rating?: number;
  review_count?: number;
  specifications?: any;
  created_at: string;
  updated_at: string;
}

export interface SystemSettings {
  id: number;
  setting_key: string;
  category: string;
  setting_value: string;
  description: string;
  type: 'string' | 'number' | 'boolean' | 'json' | 'list';
  is_public: boolean;
  default_value?: any;
  validation?: any;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrder {
  id: number;
  user_id: number;
  store_id?: number;
  type: 'emergency' | 'regular' | 'scheduled';
  items: any[];
  items_description?: string;
  total_items_quantity?: number;
  subtotal?: number;
  delivery_fee?: number;
  taxes?: number;
  discount?: number;
  total_price?: number;
  price_breakdown?: any;
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled' | 'refunded';
  delivery_address: any;
  delivery_latitude?: number;
  delivery_longitude?: number;
  delivery_instructions?: string;
  delivery_contact_name?: string;
  delivery_contact_phone?: string;
  has_delivery: boolean;
  estimated_delivery_minutes?: number;
  scheduled_delivery_at?: string;
  delivered_at?: string;
  actual_delivery_minutes?: number;
  delivery_motoboy_id?: number;
  payment_method: 'cash' | 'card' | 'pix' | 'app';
  payment_status: 'pending' | 'paid' | 'refunded';
  paid_at?: string;
  payment_info?: any;
  urgency: 'low' | 'medium' | 'high' | 'urgent';
  is_urgent: boolean;
  rating?: number;
  review_comment?: string;
  reviewed_at?: string;
  notes?: string;
  special_instructions?: string;
  delivery_proof?: any;
  invoice_info?: any;
  view_count: number;
  response_count: number;
  emergency_request_id?: number;
  created_at: string;
  updated_at: string;
  user_name?: string;
  user_phone?: string;
  store_name?: string;
  store_phone?: string;
  motoboy_name?: string;
  motoboy_phone?: string;
}
