import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || (process.env.NODE_ENV === 'production' 
  ? 'https://admin.socorreja.com.br/api' 
  : 'http://localhost:3001/api');

class UploadService {
  private api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  constructor() {
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
  }

  // Upload de documentos do parceiro
  async uploadPartnerDocuments(partnerId: number, files: File[]): Promise<any> {
    const formData = new FormData();

    files.forEach((file) => {
      formData.append('documents', file);
    });

    const response = await this.api.post(`/partners/${partnerId}/documents/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data;
  }

  // Listar documentos de um parceiro
  async getPartnerDocuments(partnerId: number, filters?: any): Promise<any> {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params.append(key, value.toString());
        }
      });
    }

    const response = await this.api.get(`/partners/${partnerId}/documents?${params}`);
    return response.data;
  }

  // Verificar documento (aprovar/rejeitar)
  async verifyDocument(documentId: number, status: 'approved' | 'rejected', rejectionReason?: string): Promise<any> {
    const response = await this.api.put(`/partners/documents/admin/${documentId}/verify`, {
      status,
      rejection_reason: rejectionReason,
    });

    return response.data;
  }

  // Download de documento
  async downloadDocument(documentId: number): Promise<Blob> {
    const response = await this.api.get(`/partners/documents/admin/${documentId}/download`, {
      responseType: 'blob',
    });

    return response.data;
  }

  // Excluir documento
  async deleteDocument(documentId: number): Promise<any> {
    const response = await this.api.delete(`/partners/documents/admin/${documentId}`);
    return response.data;
  }

  // Verificar status de documentos de um parceiro
  async checkDocumentStatus(partnerId: number): Promise<any> {
    const response = await this.api.get(`/partners/${partnerId}/documents/status`);
    return response.data;
  }

  // Listar documentos pendentes de verificação (admin)
  async getPendingDocuments(limit: number = 50): Promise<any> {
    const response = await this.api.get(`/partners/documents/admin/pending?limit=${limit}`);
    return response.data;
  }

  // Obter estatísticas de documentos
  async getDocumentStats(partnerId: number): Promise<any> {
    const response = await this.api.get(`/partners/${partnerId}/documents/stats`);
    return response.data;
  }

  // Adicionar metadados de verificação
  async addVerificationMetadata(documentId: number, metadata: any): Promise<any> {
    const response = await this.api.post(`/partners/documents/admin/${documentId}/metadata`, {
      metadata,
    });

    return response.data;
  }

  // Criar URL para download do documento
  getDocumentDownloadUrl(documentId: number): string {
    return `${API_BASE_URL}/partners/documents/admin/${documentId}/download`;
  }
}

export const uploadService = new UploadService();
export default uploadService;
