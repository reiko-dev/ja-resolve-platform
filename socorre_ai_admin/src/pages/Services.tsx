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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  IconButton,
  Tooltip,
  Alert,
  CircularProgress,
  Grid,
  Avatar,
  Switch,
  FormControlLabel,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
  Build as BuildIcon,
  AttachMoney as MoneyIcon,
  Category as CategoryIcon,
} from '@mui/icons-material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import apiService from '../services/api';

interface Service {
  id: number;
  mechanic_id: number;
  name: string;
  description: string;
  category: string;
  subcategory: string;
  price: number;
  duration_minutes: number;
  is_available: boolean;
  created_at: string;
  updated_at: string;
}

const Services: React.FC = () => {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [openViewDialog, setOpenViewDialog] = useState(false);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: '',
    subcategory: '',
    price: '',
    duration_minutes: '',
    is_available: true,
  });

  useEffect(() => {
    loadServices();
  }, []);

  const loadServices = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await apiService.getServices();
      if (response.success && response.data) {
        setServices(response.data.items || []);
      } else {
        setError(response.message || 'Erro ao carregar serviços');
      }
    } catch (err: any) {
      console.error('Erro ao carregar serviços:', err);
      setError(err.response?.data?.message || 'Erro de conexão com o servidor');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (mode: 'create' | 'edit', service?: Service) => {
    setDialogMode(mode);
    if (mode === 'edit' && service) {
      setSelectedService(service);
      setFormData({
        name: service.name,
        description: service.description,
        category: service.category,
        subcategory: service.subcategory,
        price: service.price?.toString() || '',
        duration_minutes: service.duration_minutes?.toString() || '',
        is_available: service.is_available,
      });
    } else {
      setSelectedService(null);
      setFormData({
        name: '',
        description: '',
        category: '',
        subcategory: '',
        price: '',
        duration_minutes: '',
        is_available: true,
      });
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setSelectedService(null);
    setFormData({
      name: '',
      description: '',
      category: '',
      subcategory: '',
      price: '',
      duration_minutes: '',
      is_available: true,
    });
  };

  const handleSubmit = async () => {
    try {
      if (dialogMode === 'create') {
        // Implementar criação
        console.log('Criar serviço:', formData);
      } else {
        // Implementar edição
        console.log('Editar serviço:', selectedService?.id, formData);
      }
      handleCloseDialog();
      loadServices();
    } catch (err: any) {
      console.error('Erro ao salvar serviço:', err);
      setError(err.response?.data?.message || 'Erro ao salvar serviço');
    }
  };

  const handleDeleteService = async (serviceId: number) => {
    if (window.confirm('Tem certeza que deseja excluir este serviço?')) {
      try {
        // Implementar exclusão
        console.log('Excluir serviço:', serviceId);
        loadServices();
      } catch (err: any) {
        console.error('Erro ao excluir serviço:', err);
        setError(err.response?.data?.message || 'Erro ao excluir serviço');
      }
    }
  };

  const columns: GridColDef[] = [
    { field: 'id', headerName: 'ID', width: 70 },
    { 
      field: 'name', 
      headerName: 'Nome do Serviço', 
      width: 200,
      renderCell: (params) => (
        <Box display="flex" alignItems="center">
          <Avatar sx={{ mr: 2, bgcolor: '#E30613' }}>
            <BuildIcon />
          </Avatar>
          <Typography variant="body2">{params.value}</Typography>
        </Box>
      )
    },
    { 
      field: 'category', 
      headerName: 'Categoria', 
      width: 150,
      renderCell: (params) => (
        <Chip 
          label={params.value} 
          size="small" 
          color="primary"
          variant="outlined"
        />
      )
    },
    { 
      field: 'subcategory', 
      headerName: 'Subcategoria', 
      width: 150,
      renderCell: (params) => (
        <Chip 
          label={params.value} 
          size="small" 
          color="secondary"
          variant="outlined"
        />
      )
    },
    { 
      field: 'price', 
      headerName: 'Preço', 
      width: 120,
      renderCell: (params) => (
        <Box display="flex" alignItems="center">
          <MoneyIcon sx={{ mr: 1, color: 'text.secondary', fontSize: 16 }} />
          <Typography variant="body2" fontWeight="bold">
            R$ {params.value?.toFixed(2) || '0.00'}
          </Typography>
        </Box>
      )
    },
    { 
      field: 'duration_minutes', 
      headerName: 'Duração', 
      width: 120,
      renderCell: (params) => (
        <Typography variant="body2">
          {params.value || 0} min
        </Typography>
      )
    },
    { 
      field: 'is_available', 
      headerName: 'Disponível', 
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
                setSelectedService(params.row);
                setOpenViewDialog(true);
              }}
            >
              <ViewIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Editar">
            <IconButton 
              size="small" 
              onClick={() => handleOpenDialog('edit', params.row)}
            >
              <EditIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Excluir">
            <IconButton 
              size="small" 
              color="error"
              onClick={() => handleDeleteService(params.row.id)}
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
          Gerenciamento de Serviços
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog('create')}
          sx={{
            background: 'linear-gradient(135deg, #E30613 0%, #ff1a1a 100%)',
            '&:hover': {
              background: 'linear-gradient(135deg, #ff1a1a 0%, #E30613 100%)',
            }
          }}
        >
          Novo Serviço
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Card>
        <CardContent>
          <DataGrid
            rows={services}
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

      {/* Dialog para criar/editar serviço */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>
          {dialogMode === 'create' ? 'Novo Serviço' : 'Editar Serviço'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Nome do Serviço"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                margin="normal"
                required
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Categoria"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                margin="normal"
                required
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Subcategoria"
                value={formData.subcategory}
                onChange={(e) => setFormData({ ...formData, subcategory: e.target.value })}
                margin="normal"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Preço (R$)"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                margin="normal"
                type="number"
                required
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Duração (minutos)"
                value={formData.duration_minutes}
                onChange={(e) => setFormData({ ...formData, duration_minutes: e.target.value })}
                margin="normal"
                type="number"
                required
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Descrição"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                margin="normal"
                multiline
                rows={3}
              />
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.is_available}
                    onChange={(e) => setFormData({ ...formData, is_available: e.target.checked })}
                  />
                }
                label="Serviço Disponível"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancelar</Button>
          <Button onClick={handleSubmit} variant="contained">
            {dialogMode === 'create' ? 'Criar' : 'Salvar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog para visualizar serviço */}
      <Dialog open={openViewDialog} onClose={() => setOpenViewDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>Detalhes do Serviço</DialogTitle>
        <DialogContent>
          {selectedService && (
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom>
                  {selectedService.name}
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {selectedService.description}
                </Typography>
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Categoria:
                  </Typography>
                  <Chip 
                    label={selectedService.category} 
                    color="primary"
                    variant="outlined"
                    sx={{ mr: 1 }}
                  />
                  {selectedService.subcategory && (
                    <Chip 
                      label={selectedService.subcategory} 
                      color="secondary"
                      variant="outlined"
                    />
                  )}
                </Box>
              </Grid>
              <Grid item xs={12} md={6}>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Preço:
                  </Typography>
                  <Typography variant="h6" color="primary">
                    R$ {selectedService.price?.toFixed(2) || '0.00'}
                  </Typography>
                </Box>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Duração:
                  </Typography>
                  <Typography variant="h6">
                    {selectedService.duration_minutes || 0} minutos
                  </Typography>
                </Box>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Status:
                  </Typography>
                  <Chip 
                    label={selectedService.is_available ? 'Disponível' : 'Indisponível'}
                    color={selectedService.is_available ? 'success' : 'error'}
                  />
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

export default Services;
