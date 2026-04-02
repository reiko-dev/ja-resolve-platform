import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { User, Category, DashboardStats, LoginCredentials, AuthResponse, ApiResponse, PaginatedResponse } from '../types';

const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? 'https://admin.socorreja.com.br/api' 
  : 'http://localhost:3001/api';

class ApiService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Interceptor para adicionar token de autenticação
    this.api.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('admin_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Interceptor para tratar erros de resposta
    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          localStorage.removeItem('admin_token');
          localStorage.removeItem('admin_user');
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }

  // Autenticação
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const response: AxiosResponse<AuthResponse> = await this.api.post('/auth/login', credentials);
    if (response.data.success && response.data.data) {
      localStorage.setItem('admin_token', response.data.data.token);
      localStorage.setItem('admin_user', JSON.stringify(response.data.data.user));
    }
    return response.data;
  }

  async logout(): Promise<void> {
    try {
      await this.api.post('/auth/logout');
    } catch (error) {
      console.error('Erro ao fazer logout:', error);
    } finally {
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_user');
    }
  }

  async verifyToken(): Promise<ApiResponse<User>> {
    const response: AxiosResponse<ApiResponse<User>> = await this.api.get('/auth/verify');
    return response.data;
  }

  // Usuários
  async getUsers(page: number = 1, limit: number = 10): Promise<PaginatedResponse<User>> {
    const response: AxiosResponse<PaginatedResponse<User>> = await this.api.get(`/users?page=${page}&limit=${limit}`);
    return response.data;
  }

  async getUserById(id: number): Promise<ApiResponse<User>> {
    const response: AxiosResponse<ApiResponse<User>> = await this.api.get(`/users/${id}`);
    return response.data;
  }

  async createUser(userData: { name: string; email: string; phone?: string; role?: string; password: string }): Promise<ApiResponse<User>> {
    const response: AxiosResponse<ApiResponse<User>> = await this.api.post('/users', userData);
    return response.data;
  }

  async updateUser(id: number, userData: Partial<User>): Promise<ApiResponse<User>> {
    const response: AxiosResponse<ApiResponse<User>> = await this.api.put(`/users/${id}`, userData);
    return response.data;
  }

  async deleteUser(id: number): Promise<ApiResponse<void>> {
    const response: AxiosResponse<ApiResponse<void>> = await this.api.delete(`/users/${id}`);
    return response.data;
  }

  // Categorias
  async getCategories(): Promise<ApiResponse<Category[]>> {
    const response: AxiosResponse<ApiResponse<Category[]>> = await this.api.get('/categories');
    return response.data;
  }

  async createCategory(categoryData: Omit<Category, 'id' | 'created_at' | 'updated_at'>): Promise<ApiResponse<Category>> {
    const response: AxiosResponse<ApiResponse<Category>> = await this.api.post('/categories', categoryData);
    return response.data;
  }

  async updateCategory(id: number, categoryData: Partial<Category>): Promise<ApiResponse<Category>> {
    const response: AxiosResponse<ApiResponse<Category>> = await this.api.put(`/categories/${id}`, categoryData);
    return response.data;
  }

  async deleteCategory(id: number): Promise<ApiResponse<void>> {
    const response: AxiosResponse<ApiResponse<void>> = await this.api.delete(`/categories/${id}`);
    return response.data;
  }

  // Dashboard
  async getDashboardStats(): Promise<ApiResponse<DashboardStats>> {
    const response: AxiosResponse<ApiResponse<DashboardStats>> = await this.api.get('/dashboard/stats');
    return response.data;
  }

  // Health check
  async healthCheck(): Promise<ApiResponse<any>> {
    const response: AxiosResponse<ApiResponse<any>> = await this.api.get('/health');
    return response.data;
  }

  // Mecânicos
  async getMechanics(page: number = 1, limit: number = 10): Promise<PaginatedResponse<any>> {
    const response: AxiosResponse<PaginatedResponse<any>> = await this.api.get(`/mechanics?page=${page}&limit=${limit}`);
    return response.data;
  }

  async getMechanicById(id: number): Promise<ApiResponse<any>> {
    const response: AxiosResponse<ApiResponse<any>> = await this.api.get(`/mechanics/${id}`);
    return response.data;
  }

  async searchMechanics(filters: any): Promise<ApiResponse<any[]>> {
    const params = new URLSearchParams(filters);
    const response: AxiosResponse<ApiResponse<any[]>> = await this.api.get(`/mechanics/search?${params}`);
    return response.data;
  }

  async getMechanicsByProximity(lat: number, lng: number, radius: number): Promise<ApiResponse<any[]>> {
    const response: AxiosResponse<ApiResponse<any[]>> = await this.api.get(`/mechanics/proximity?lat=${lat}&lng=${lng}&radius=${radius}`);
    return response.data;
  }

  async getMechanicsBySpecialty(specialty: string): Promise<ApiResponse<any[]>> {
    const response: AxiosResponse<ApiResponse<any[]>> = await this.api.get(`/mechanics/specialty/${specialty}`);
    return response.data;
  }

  // Serviços
  async getServices(page: number = 1, limit: number = 10): Promise<PaginatedResponse<any>> {
    const response: AxiosResponse<PaginatedResponse<any>> = await this.api.get(`/services?page=${page}&limit=${limit}`);
    return response.data;
  }

  async getServiceById(id: number): Promise<ApiResponse<any>> {
    const response: AxiosResponse<ApiResponse<any>> = await this.api.get(`/services/${id}`);
    return response.data;
  }

  async getServicesByCategory(category: string): Promise<ApiResponse<any[]>> {
    const response: AxiosResponse<ApiResponse<any[]>> = await this.api.get(`/services/category/${category}`);
    return response.data;
  }

  // Agendamentos
  async getAppointments(page: number = 1, limit: number = 10): Promise<PaginatedResponse<any>> {
    const response: AxiosResponse<PaginatedResponse<any>> = await this.api.get(`/appointments?page=${page}&limit=${limit}`);
    return response.data;
  }

  async getAppointmentById(id: number): Promise<ApiResponse<any>> {
    const response: AxiosResponse<ApiResponse<any>> = await this.api.get(`/appointments/${id}`);
    return response.data;
  }

  async updateAppointmentStatus(id: number, status: string, notes?: string): Promise<ApiResponse<any>> {
    const response: AxiosResponse<ApiResponse<any>> = await this.api.patch(`/appointments/${id}/status`, { status, notes });
    return response.data;
  }

  // Avaliações
  async getReviews(page: number = 1, limit: number = 10): Promise<PaginatedResponse<any>> {
    const response: AxiosResponse<PaginatedResponse<any>> = await this.api.get(`/reviews?page=${page}&limit=${limit}`);
    return response.data;
  }

  async getReviewsByMechanic(mechanicId: number): Promise<ApiResponse<any[]>> {
    const response: AxiosResponse<ApiResponse<any[]>> = await this.api.get(`/reviews/mechanic/${mechanicId}`);
    return response.data;
  }

  async verifyReview(id: number, isVerified: boolean): Promise<ApiResponse<any>> {
    const response: AxiosResponse<ApiResponse<any>> = await this.api.patch(`/reviews/${id}/verify`, { is_verified: isVerified });
    return response.data;
  }

  // Parceiros (nova estrutura)
  async getPartners(filters?: any): Promise<PaginatedResponse<any>> {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, value.toString());
        }
      });
    }
    const response: AxiosResponse<PaginatedResponse<any>> = await this.api.get(`/partners?${params}`);
    return response.data;
  }

  async getPartnerById(id: number): Promise<ApiResponse<any>> {
    const response: AxiosResponse<ApiResponse<any>> = await this.api.get(`/partners/${id}`);
    return response.data;
  }

  async getPartnersNearby(lat: number, lng: number, radius: number = 10, type?: string): Promise<ApiResponse<any[]>> {
    const params = new URLSearchParams({ 
      latitude: lat.toString(), 
      longitude: lng.toString(), 
      radius: radius.toString() 
    });
    if (type) params.append('type', type);
    const response: AxiosResponse<ApiResponse<any[]>> = await this.api.get(`/partners/nearby?${params}`);
    return response.data;
  }

  async getPartnersBySpecialty(specialty: string, lat: number, lng: number, radius: number = 10): Promise<ApiResponse<any[]>> {
    const params = new URLSearchParams({ 
      specialty, 
      latitude: lat.toString(), 
      longitude: lng.toString(), 
      radius: radius.toString() 
    });
    const response: AxiosResponse<ApiResponse<any[]>> = await this.api.get(`/partners/specialty?${params}`);
    return response.data;
  }

  async getAvailableForEmergency(type: string, lat: number, lng: number, radius: number = 15): Promise<ApiResponse<any[]>> {
    const params = new URLSearchParams({ 
      type, 
      latitude: lat.toString(), 
      longitude: lng.toString(), 
      radius: radius.toString() 
    });
    const response: AxiosResponse<ApiResponse<any[]>> = await this.api.get(`/partners/emergency?${params}`);
    return response.data;
  }

  async getAvailableMotoboys(lat: number, lng: number, radius: number = 20): Promise<ApiResponse<any[]>> {
    const params = new URLSearchParams({ 
      latitude: lat.toString(), 
      longitude: lng.toString(), 
      radius: radius.toString() 
    });
    const response: AxiosResponse<ApiResponse<any[]>> = await this.api.get(`/partners/motoboys?${params}`);
    return response.data;
  }

  async getStoresByCategory(category: string, lat: number, lng: number, radius: number = 25): Promise<ApiResponse<any[]>> {
    const params = new URLSearchParams({ 
      category, 
      latitude: lat.toString(), 
      longitude: lng.toString(), 
      radius: radius.toString() 
    });
    const response: AxiosResponse<ApiResponse<any[]>> = await this.api.get(`/partners/stores?${params}`);
    return response.data;
  }

  async updatePartnerStatus(id: number, isOnline: boolean): Promise<ApiResponse<any>> {
    const response: AxiosResponse<ApiResponse<any>> = await this.api.put(`/partners/${id}/online-status`, { is_online: isOnline });
    return response.data;
  }

  async updatePartnerLocation(id: number, lat: number, lng: number, address: string): Promise<ApiResponse<any>> {
    const response: AxiosResponse<ApiResponse<any>> = await this.api.put(`/partners/${id}/location`, { 
      latitude: lat, 
      longitude: lng, 
      address 
    });
    return response.data;
  }

  // Solicitações de emergência (nova lógica)
  async getEmergencyRequests(filters?: any): Promise<PaginatedResponse<any>> {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, value.toString());
        }
      });
    }
    const response: AxiosResponse<PaginatedResponse<any>> = await this.api.get(`/emergency-requests?${params}`);
    return response.data;
  }

  async getEmergencyRequestById(id: number): Promise<ApiResponse<any>> {
    const response: AxiosResponse<ApiResponse<any>> = await this.api.get(`/emergency-requests/${id}`);
    return response.data;
  }

  async getEmergencyRequestsNearby(lat: number, lng: number, radius: number = 15, type?: string): Promise<ApiResponse<any[]>> {
    const params = new URLSearchParams({ 
      latitude: lat.toString(), 
      longitude: lng.toString(), 
      radius: radius.toString() 
    });
    if (type) params.append('type', type);
    const response: AxiosResponse<ApiResponse<any[]>> = await this.api.get(`/emergency-requests/nearby?${params}`);
    return response.data;
  }

  async getEmergencyRequestStats(): Promise<ApiResponse<any>> {
    const response: AxiosResponse<ApiResponse<any>> = await this.api.get('/emergency-requests/stats');
    return response.data;
  }

  // Propostas de guincho (novo)
  async getTowProposals(filters?: any): Promise<PaginatedResponse<any>> {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, value.toString());
        }
      });
    }
    const response: AxiosResponse<PaginatedResponse<any>> = await this.api.get(`/tow-proposals?${params}`);
    return response.data;
  }

  async getTowProposalById(id: number): Promise<ApiResponse<any>> {
    const response: AxiosResponse<ApiResponse<any>> = await this.api.get(`/tow-proposals/${id}`);
    return response.data;
  }

  async getTowProposalStats(): Promise<ApiResponse<any>> {
    const response: AxiosResponse<ApiResponse<any>> = await this.api.get('/tow-proposals/stats');
    return response.data;
  }

  // Ordens de delivery (nova lógica)
  async getDeliveryOrders(filters?: any): Promise<PaginatedResponse<any>> {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, value.toString());
        }
      });
    }
    const response: AxiosResponse<PaginatedResponse<any>> = await this.api.get(`/delivery-orders?${params}`);
    return response.data;
  }

  async getDeliveryOrderById(id: number): Promise<ApiResponse<any>> {
    const response: AxiosResponse<ApiResponse<any>> = await this.api.get(`/delivery-orders/${id}`);
    return response.data;
  }

  async getDeliveryOrderStats(): Promise<ApiResponse<any>> {
    const response: AxiosResponse<ApiResponse<any>> = await this.api.get('/delivery-orders/stats');
    return response.data;
  }

  // Assinaturas (novo)
  async getSubscriptions(filters?: any): Promise<PaginatedResponse<any>> {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, value.toString());
        }
      });
    }
    const response: AxiosResponse<PaginatedResponse<any>> = await this.api.get(`/subscriptions?${params}`);
    return response.data;
  }

  async getSubscriptionById(id: number): Promise<ApiResponse<any>> {
    const response: AxiosResponse<ApiResponse<any>> = await this.api.get(`/subscriptions/${id}`);
    return response.data;
  }

  async getSubscriptionStats(): Promise<ApiResponse<any>> {
    const response: AxiosResponse<ApiResponse<any>> = await this.api.get('/subscriptions/stats');
    return response.data;
  }

  async createSubscription(subscriptionData: any): Promise<ApiResponse<any>> {
    const response: AxiosResponse<ApiResponse<any>> = await this.api.post('/subscriptions', subscriptionData);
    return response.data;
  }

  async updateSubscription(id: number, subscriptionData: any): Promise<ApiResponse<any>> {
    const response: AxiosResponse<ApiResponse<any>> = await this.api.put(`/subscriptions/${id}`, subscriptionData);
    return response.data;
  }

  async cancelSubscription(id: number, reason: string): Promise<ApiResponse<any>> {
    const response: AxiosResponse<ApiResponse<any>> = await this.api.post(`/subscriptions/${id}/cancel`, { reason });
    return response.data;
  }

  async renewSubscription(id: number): Promise<ApiResponse<any>> {
    const response: AxiosResponse<ApiResponse<any>> = await this.api.post(`/subscriptions/${id}/renew`);
    return response.data;
  }

  // Produtos (novo)
  async getProducts(filters?: any): Promise<PaginatedResponse<any>> {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, value.toString());
        }
      });
    }
    const response: AxiosResponse<PaginatedResponse<any>> = await this.api.get(`/products?${params}`);
    return response.data;
  }

  async getProductById(id: number): Promise<ApiResponse<any>> {
    const response: AxiosResponse<ApiResponse<any>> = await this.api.get(`/products/${id}`);
    return response.data;
  }

  async getProductStats(): Promise<ApiResponse<any>> {
    const response: AxiosResponse<ApiResponse<any>> = await this.api.get('/products/stats');
    return response.data;
  }

  async createProduct(productData: any): Promise<ApiResponse<any>> {
    const response: AxiosResponse<ApiResponse<any>> = await this.api.post('/products', productData);
    return response.data;
  }

  async updateProduct(id: number, productData: any): Promise<ApiResponse<any>> {
    const response: AxiosResponse<ApiResponse<any>> = await this.api.put(`/products/${id}`, productData);
    return response.data;
  }

  async deleteProduct(id: number): Promise<ApiResponse<any>> {
    const response: AxiosResponse<ApiResponse<any>> = await this.api.delete(`/products/${id}`);
    return response.data;
  }

  async updateProductStock(id: number, stock: number): Promise<ApiResponse<any>> {
    const response: AxiosResponse<ApiResponse<any>> = await this.api.patch(`/products/${id}/stock`, { stock });
    return response.data;
  }

  async toggleProductActive(id: number): Promise<ApiResponse<any>> {
    const response: AxiosResponse<ApiResponse<any>> = await this.api.patch(`/products/${id}/toggle-active`);
    return response.data;
  }

  async toggleProductFeatured(id: number): Promise<ApiResponse<any>> {
    const response: AxiosResponse<ApiResponse<any>> = await this.api.patch(`/products/${id}/toggle-featured`);
    return response.data;
  }

  // Configurações do sistema (novo)
  async getSystemSettings(category?: string): Promise<ApiResponse<any[]>> {
    const params = new URLSearchParams();
    if (category) params.append('category', category);
    const response: AxiosResponse<ApiResponse<any[]>> = await this.api.get(`/system-settings?${params}`);
    return response.data;
  }

  async getSystemSetting(key: string): Promise<ApiResponse<any>> {
    const response: AxiosResponse<ApiResponse<any>> = await this.api.get(`/system-settings/${key}`);
    return response.data;
  }

  async updateSystemSetting(key: string, value: string): Promise<ApiResponse<any>> {
    const response: AxiosResponse<ApiResponse<any>> = await this.api.put(`/system-settings/${key}`, { value });
    return response.data;
  }

  async getPublicSettings(): Promise<ApiResponse<any>> {
    const response: AxiosResponse<ApiResponse<any>> = await this.api.get('/system-settings/public');
    return response.data;
  }

  // Pedidos de compra
  async getPurchaseOrders(page: number = 1, limit: number = 10, filters?: any): Promise<PaginatedResponse<any>> {
    const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() });
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, value.toString());
        }
      });
    }
    const response: AxiosResponse<PaginatedResponse<any>> = await this.api.get(`/purchase-orders?${params}`);
    return response.data;
  }

  async getPurchaseOrderById(id: number): Promise<ApiResponse<any>> {
    const response: AxiosResponse<ApiResponse<any>> = await this.api.get(`/purchase-orders/${id}`);
    return response.data;
  }

  async getPurchaseOrderStats(): Promise<ApiResponse<any>> {
    const response: AxiosResponse<ApiResponse<any>> = await this.api.get('/purchase-orders/stats');
    return response.data;
  }

  // Aprovar/Rejeitar parceiros
  async approvePartner(partnerId: number, isApproved: boolean): Promise<ApiResponse<any>> {
    const response: AxiosResponse<ApiResponse<any>> = await this.api.put(`/partners/${partnerId}/approve`, {
      is_verified: isApproved
    });
    return response.data;
  }

  // Criar novo parceiro
  async createPartner(partnerData: any): Promise<ApiResponse<any>> {
    const response: AxiosResponse<ApiResponse<any>> = await this.api.post('/partners', partnerData);
    return response.data;
  }

  // Método genérico get para usar diretamente
  async get(url: string): Promise<any> {
    return await this.api.get(url);
  }

  // Método genérico post
  async post(url: string, data?: any): Promise<any> {
    return await this.api.post(url, data);
  }

  // Método genérico put
  async put(url: string, data?: any): Promise<any> {
    return await this.api.put(url, data);
  }

  // Método genérico patch
  async patch(url: string, data?: any): Promise<any> {
    return await this.api.patch(url, data);
  }

  // Método genérico delete
  async delete(url: string): Promise<any> {
    return await this.api.delete(url);
  }
}

export const apiService = new ApiService();
export default apiService;
