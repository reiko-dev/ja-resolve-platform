import React, { useState, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Box,
  Typography,
  Alert,
  Snackbar,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Check as CheckIcon,
  Close as CloseIcon,
  Description as DocumentIcon,
  Visibility as ViewIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Document {
  id: string;
  partner_id: string;
  document_type: string;
  original_name: string;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason?: string;
  uploaded_at: string;
  verified_at?: string;
  partner: {
    id: string;
    name: string;
    email: string;
    phone: string;
    type: string;
    business_name?: string;
  };
}

interface Partner {
  id: string;
  name: string;
  email: string;
  phone: string;
  type: string;
  business_name?: string;
  approval_status: 'pending' | 'approved' | 'rejected' | 'documents_required';
}

const DocumentApproval: React.FC = () => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  useEffect(() => {
    fetchPendingDocuments();
  }, []);

  const fetchPendingDocuments = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('adminToken');
      
      const response = await fetch('/api/documents/pending', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Erro ao buscar documentos');
      }

      const data = await response.json();
      setDocuments(data.data.documents || []);
    } catch (error) {
      console.error('Erro:', error);
      showSnackbar('Erro ao carregar documentos', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (documentId: string) => {
    try {
      const token = localStorage.getItem('adminToken');
      
      const response = await fetch(`/api/documents/${documentId}/verify`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'approved'
        }),
      });

      if (!response.ok) {
        throw new Error('Erro ao aprovar documento');
      }

      showSnackbar('Documento aprovado com sucesso', 'success');
      fetchPendingDocuments();
    } catch (error) {
      console.error('Erro:', error);
      showSnackbar('Erro ao aprovar documento', 'error');
    }
  };

  const handleReject = async () => {
    if (!selectedDocument || !rejectionReason.trim()) {
      return;
    }

    try {
      const token = localStorage.getItem('adminToken');
      
      const response = await fetch(`/api/documents/${selectedDocument.id}/verify`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'rejected',
          rejection_reason: rejectionReason
        }),
      });

      if (!response.ok) {
        throw new Error('Erro ao rejeitar documento');
      }

      showSnackbar('Documento rejeitado com sucesso', 'success');
      setRejectDialogOpen(false);
      setSelectedDocument(null);
      setRejectionReason('');
      fetchPendingDocuments();
    } catch (error) {
      console.error('Erro:', error);
      showSnackbar('Erro ao rejeitar documento', 'error');
    }
  };

  const showSnackbar = (message: string, severity: 'success' | 'error') => {
    setSnackbar({ open: true, message, severity });
  };

  const getDocumentTypeLabel = (type: string) => {
    const types: { [key: string]: string } = {
      'cpf': 'CPF',
      'cnpj': 'CNPJ',
      'cnh': 'CNH',
      'vehicle_document': 'Documento do Veículo',
      'address_proof': 'Comprovante de Residência',
      'business_license': 'Licença de Funcionamento',
    };
    return types[type] || type;
  };

  const getPartnerTypeLabel = (type: string) => {
    const types: { [key: string]: string } = {
      'mechanic': 'Mecânico',
      'gasstation': 'Posto de Combustível',
      'autoparts': 'Auto Peças',
      'towtruck': 'Guincho',
      'delivery': 'Motoboy',
    };
    return types[type] || type;
  };

  const getStatusChip = (status: string) => {
    const colors: { [key: string]: 'default' | 'primary' | 'success' | 'error' | 'warning' } = {
      'pending': 'warning',
      'approved': 'success',
      'rejected': 'error',
    };

    const labels: { [key: string]: string } = {
      'pending': 'Pendente',
      'approved': 'Aprovado',
      'rejected': 'Rejeitado',
    };

    return (
      <Chip
        label={labels[status] || status}
        color={colors[status] || 'default'}
        size="small"
      />
    );
  };

  const downloadDocument = async (documentId: string, fileName: string) => {
    try {
      const token = localStorage.getItem('adminToken');
      
      const response = await fetch(`/api/documents/${documentId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Erro ao baixar documento');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Erro:', error);
      showSnackbar('Erro ao baixar documento', 'error');
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Aprovação de Documentos
      </Typography>
      
      <Typography variant="body1" color="textSecondary" gutterBottom>
        Revise e aprove os documentos enviados pelos parceiros
      </Typography>

      {loading ? (
        <Box display="flex" justifyContent="center" p={4}>
          <Typography>Carregando...</Typography>
        </Box>
      ) : documents.length === 0 ? (
        <Alert severity="info" sx={{ mt: 2 }}>
          Nenhum documento pendente de aprovação no momento.
        </Alert>
      ) : (
        <TableContainer component={Paper} sx={{ mt: 2 }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Parceiro</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Documento</TableCell>
                <TableCell>Data Envio</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {documents.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell>
                    <Box>
                      <Typography variant="body2" fontWeight="bold">
                        {doc.partner.business_name || doc.partner.name}
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        {getPartnerTypeLabel(doc.partner.type)}
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        {doc.partner.email} | {doc.partner.phone}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>{getPartnerTypeLabel(doc.partner.type)}</TableCell>
                  <TableCell>{getDocumentTypeLabel(doc.document_type)}</TableCell>
                  <TableCell>
                    {format(new Date(doc.uploaded_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                  </TableCell>
                  <TableCell>{getStatusChip(doc.status)}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Tooltip title="Visualizar documento">
                        <IconButton
                          size="small"
                          onClick={() => downloadDocument(doc.id, doc.original_name)}
                        >
                          <ViewIcon />
                        </IconButton>
                      </Tooltip>
                      
                      {doc.status === 'pending' && (
                        <>
                          <Tooltip title="Aprovar">
                            <IconButton
                              size="small"
                              color="success"
                              onClick={() => handleApprove(doc.id)}
                            >
                              <CheckIcon />
                            </IconButton>
                          </Tooltip>
                          
                          <Tooltip title="Rejeitar">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => {
                                setSelectedDocument(doc);
                                setRejectDialogOpen(true);
                              }}
                            >
                              <CloseIcon />
                            </IconButton>
                          </Tooltip>
                        </>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Dialog de rejeição */}
      <Dialog open={rejectDialogOpen} onClose={() => setRejectDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Rejeitar Documento</DialogTitle>
        <DialogContent>
          <Typography gutterBottom>
            Tem certeza que deseja rejeitar este documento? Informe o motivo:
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={4}
            label="Motivo da rejeição"
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            margin="normal"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectDialogOpen(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleReject} 
            color="error" 
            variant="contained"
            disabled={!rejectionReason.trim()}
          >
            Rejeitar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default DocumentApproval;
