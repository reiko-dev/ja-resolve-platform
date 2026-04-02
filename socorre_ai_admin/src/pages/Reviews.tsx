import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Chip,
  IconButton,
  Tooltip,
  Alert,
  CircularProgress,
  Grid,
  Avatar,
  Rating,
  FormControlLabel,
  Switch,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
  Star as StarIcon,
  CheckCircle as VerifiedIcon,
  Cancel as UnverifiedIcon,
  Person as PersonIcon,
  Build as BuildIcon,
} from '@mui/icons-material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import apiService from '../services/api';

interface Review {
  id: number;
  user_id: number;
  mechanic_id: number;
  rating: number;
  comment: string;
  is_verified: boolean;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

const Reviews: React.FC = () => {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openViewDialog, setOpenViewDialog] = useState(false);
  const [selectedReview, setSelectedReview] = useState<Review | null>(null);

  useEffect(() => {
    loadReviews();
  }, []);

  const loadReviews = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await apiService.getReviews();
      if (response.success && response.data) {
        setReviews(response.data.items || []);
      } else {
        setError(response.message || 'Erro ao carregar avaliações');
      }
    } catch (err: any) {
      console.error('Erro ao carregar avaliações:', err);
      setError(err.response?.data?.message || 'Erro de conexão com o servidor');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyReview = async (reviewId: number, isVerified: boolean) => {
    try {
      // Implementar verificação
      console.log('Verificar avaliação:', reviewId, isVerified);
      loadReviews();
    } catch (err: any) {
      console.error('Erro ao verificar avaliação:', err);
      setError(err.response?.data?.message || 'Erro ao verificar avaliação');
    }
  };

  const handleDeleteReview = async (reviewId: number) => {
    if (window.confirm('Tem certeza que deseja excluir esta avaliação?')) {
      try {
        // Implementar exclusão
        console.log('Excluir avaliação:', reviewId);
        loadReviews();
      } catch (err: any) {
        console.error('Erro ao excluir avaliação:', err);
        setError(err.response?.data?.message || 'Erro ao excluir avaliação');
      }
    }
  };

  const columns: GridColDef[] = [
    { field: 'id', headerName: 'ID', width: 70 },
    { 
      field: 'rating', 
      headerName: 'Rating', 
      width: 150,
      renderCell: (params) => (
        <Box display="flex" alignItems="center">
          <Rating value={params.value || 0} readOnly size="small" />
          <Typography variant="body2" sx={{ ml: 1 }}>
            {params.value?.toFixed(1) || '0.0'}
          </Typography>
        </Box>
      )
    },
    { 
      field: 'comment', 
      headerName: 'Comentário', 
      width: 300,
      renderCell: (params) => (
        <Typography variant="body2" noWrap>
          {params.value || 'Sem comentário'}
        </Typography>
      )
    },
    { 
      field: 'is_verified', 
      headerName: 'Verificado', 
      width: 120,
      renderCell: (params) => (
        <Chip 
          icon={params.value ? <VerifiedIcon /> : <UnverifiedIcon />}
          label={params.value ? 'Sim' : 'Não'}
          color={params.value ? 'success' : 'default'}
          size="small"
        />
      )
    },
    { 
      field: 'is_public', 
      headerName: 'Público', 
      width: 120,
      renderCell: (params) => (
        <Chip 
          label={params.value ? 'Sim' : 'Não'}
          color={params.value ? 'success' : 'error'}
          size="small"
        />
      )
    },
    { 
      field: 'created_at', 
      headerName: 'Data', 
      width: 120,
      renderCell: (params) => (
        <Typography variant="body2">
          {new Date(params.value).toLocaleDateString('pt-BR')}
        </Typography>
      )
    },
    {
      field: 'actions',
      headerName: 'Ações',
      width: 200,
      sortable: false,
      renderCell: (params) => (
        <Box>
          <Tooltip title="Visualizar">
            <IconButton 
              size="small" 
              onClick={() => {
                setSelectedReview(params.row);
                setOpenViewDialog(true);
              }}
            >
              <ViewIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title={params.row.is_verified ? 'Desverificar' : 'Verificar'}>
            <IconButton 
              size="small" 
              color={params.row.is_verified ? 'warning' : 'success'}
              onClick={() => handleVerifyReview(params.row.id, !params.row.is_verified)}
            >
              {params.row.is_verified ? <UnverifiedIcon /> : <VerifiedIcon />}
            </IconButton>
          </Tooltip>
          <Tooltip title="Excluir">
            <IconButton 
              size="small" 
              color="error"
              onClick={() => handleDeleteReview(params.row.id)}
            >
              <DeleteIcon />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
  ];

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress size={60} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" fontWeight="bold" color="#002F6C">
          Gerenciamento de Avaliações
        </Typography>
        <Box>
          <Typography variant="body2" color="text.secondary">
            Total: {reviews.length} avaliações
          </Typography>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Card>
        <CardContent>
          <DataGrid
            rows={reviews}
            columns={columns}
            initialState={{
              pagination: {
                paginationModel: { page: 0, pageSize: 10 },
              },
            }}
            pageSizeOptions={[10, 25, 50]}
            disableRowSelectionOnClick
            autoHeight
            sx={{
              '& .MuiDataGrid-cell': {
                borderBottom: '1px solid #f0f0f0',
              },
              '& .MuiDataGrid-columnHeaders': {
                backgroundColor: '#f8f9fa',
                borderBottom: '2px solid #e0e0e0',
              },
            }}
          />
        </CardContent>
      </Card>

      {/* Dialog para visualizar avaliação */}
      <Dialog open={openViewDialog} onClose={() => setOpenViewDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>Detalhes da Avaliação</DialogTitle>
        <DialogContent>
          {selectedReview && (
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom>
                  Avaliação #{selectedReview.id}
                </Typography>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Rating:
                  </Typography>
                  <Rating value={selectedReview.rating || 0} readOnly size="large" />
                  <Typography variant="h6" color="primary" sx={{ ml: 1 }}>
                    {selectedReview.rating?.toFixed(1) || '0.0'}
                  </Typography>
                </Box>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Comentário:
                  </Typography>
                  <Typography variant="body2" sx={{ 
                    p: 2, 
                    bgcolor: 'grey.50', 
                    borderRadius: 1,
                    minHeight: 80
                  }}>
                    {selectedReview.comment || 'Sem comentário'}
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} md={6}>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Status:
                  </Typography>
                  <Box>
                    <Chip 
                      icon={selectedReview.is_verified ? <VerifiedIcon /> : <UnverifiedIcon />}
                      label={selectedReview.is_verified ? 'Verificado' : 'Não Verificado'}
                      color={selectedReview.is_verified ? 'success' : 'default'}
                      sx={{ mr: 1, mb: 1 }}
                    />
                    <Chip 
                      label={selectedReview.is_public ? 'Público' : 'Privado'}
                      color={selectedReview.is_public ? 'success' : 'error'}
                    />
                  </Box>
                </Box>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Data de Criação:
                  </Typography>
                  <Typography variant="h6">
                    {new Date(selectedReview.created_at).toLocaleDateString('pt-BR')}
                  </Typography>
                </Box>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Última Atualização:
                  </Typography>
                  <Typography variant="body2">
                    {new Date(selectedReview.updated_at).toLocaleDateString('pt-BR')}
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenViewDialog(false)}>Fechar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Reviews;
