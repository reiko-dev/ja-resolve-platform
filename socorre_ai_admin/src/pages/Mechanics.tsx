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
  Rating,
  Switch,
  FormControlLabel,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
  CheckCircle as VerifiedIcon,
  Cancel as UnverifiedIcon,
  LocationOn as LocationIcon,
  Phone as PhoneIcon,
  Email as EmailIcon,
  Business as BusinessIcon,
} from '@mui/icons-material';
import { DataGrid, GridColDef, GridActionsCellItem } from '@mui/x-data-grid';
import apiService from '../services/api';

interface Mechanic {
  id: number;
  user_id: number;
  business_name: string;
  description: string;
  specialties: string[];
  address: string;
  latitude: number;
  longitude: number;
  phone: string;
  email: string;
  hourly_rate: number;
  rating: number;
  is_verified: boolean;
  is_available: boolean;
  experience_years: number;
  emergency_service: boolean;
  home_service: boolean;
  created_at: string;
  updated_at: string;
}

const Mechanics: React.FC = () => {
  const [mechanics, setMechanics] = useState<Mechanic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [openViewDialog, setOpenViewDialog] = useState(false);
  const [selectedMechanic, setSelectedMechanic] = useState<Mechanic | null>(null);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [formData, setFormData] = useState({
    business_name: '',
    description: '',
    specialties: [] as string[],
    address: '',
    latitude: '',
    longitude: '',
    phone: '',
    email: '',
    hourly_rate: '',
    experience_years: '',
    emergency_service: false,
    home_service: false,
  });

  useEffect(() => {
    loadMechanics();
  }, []);

  const loadMechanics = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await apiService.getMechanics();
      if (response.success && response.data) {
        setMechanics(response.data.items || []);
      } else {
        setError(response.message || 'Erro ao carregar mecânicos');
      }
    } catch (err: any) {
      console.error('Erro ao carregar mecânicos:', err);
      setError(err.response?.data?.message || 'Erro de conexão com o servidor');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (mode: 'create' | 'edit', mechanic?: Mechanic) => {
    setDialogMode(mode);
    if (mode === 'edit' && mechanic) {
      setSelectedMechanic(mechanic);
      setFormData({
        business_name: mechanic.business_name,
        description: mechanic.description,
        specialties: mechanic.specialties,
        address: mechanic.address,
        latitude: mechanic.latitude?.toString() || '',
        longitude: mechanic.longitude?.toString() || '',
        phone: mechanic.phone,
        email: mechanic.email,
        hourly_rate: mechanic.hourly_rate?.toString() || '',
        experience_years: mechanic.experience_years?.toString() || '',
        emergency_service: mechanic.emergency_service,
        home_service: mechanic.home_service,
      });
    } else {
      setSelectedMechanic(null);
      setFormData({
        business_name: '',
        description: '',
        specialties: [],
        address: '',
        latitude: '',
        longitude: '',
        phone: '',
        email: '',
        hourly_rate: '',
        experience_years: '',
        emergency_service: false,
        home_service: false,
      });
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setSelectedMechanic(null);
    setFormData({
      business_name: '',
      description: '',
      specialties: [],
      address: '',
      latitude: '',
      longitude: '',
      phone: '',
      email: '',
      hourly_rate: '',
      experience_years: '',
      emergency_service: false,
      home_service: false,
    });
  };

  const handleSubmit = async () => {
    try {
      if (dialogMode === 'create') {
        // Implementar criação
        console.log('Criar mecânico:', formData);
      } else {
        // Implementar edição
        console.log('Editar mecânico:', selectedMechanic?.id, formData);
      }
      handleCloseDialog();
      loadMechanics();
    } catch (err: any) {
      console.error('Erro ao salvar mecânico:', err);
      setError(err.response?.data?.message || 'Erro ao salvar mecânico');
    }
  };

  const handleVerifyMechanic = async (mechanicId: number, isVerified: boolean) => {
    try {
      // Implementar verificação
      console.log('Verificar mecânico:', mechanicId, isVerified);
      loadMechanics();
    } catch (err: any) {
      console.error('Erro ao verificar mecânico:', err);
      setError(err.response?.data?.message || 'Erro ao verificar mecânico');
    }
  };

  const handleDeleteMechanic = async (mechanicId: number) => {
    if (window.confirm('Tem certeza que deseja excluir este mecânico?')) {
      try {
        // Implementar exclusão
        console.log('Excluir mecânico:', mechanicId);
        loadMechanics();
      } catch (err: any) {
        console.error('Erro ao excluir mecânico:', err);
        setError(err.response?.data?.message || 'Erro ao excluir mecânico');
      }
    }
  };

  const columns: GridColDef[] = [
    { field: 'id', headerName: 'ID', width: 70 },
    { 
      field: 'business_name', 
      headerName: 'Nome da Empresa', 
      width: 200,
      renderCell: (params) => (
        <Box display="flex" alignItems="center">
          <Avatar sx={{ mr: 2, bgcolor: '#002F6C' }}>
            <BusinessIcon />
          </Avatar>
          <Typography variant="body2">{params.value}</Typography>
        </Box>
      )
    },
    { 
      field: 'specialties', 
      headerName: 'Especialidades', 
      width: 200,
      renderCell: (params) => (
        <Box>
          {params.value?.map((specialty: string, index: number) => (
            <Chip 
              key={index} 
              label={specialty} 
              size="small" 
              sx={{ mr: 0.5, mb: 0.5 }}
            />
          ))}
        </Box>
      )
    },
    { 
      field: 'rating', 
      headerName: 'Rating', 
      width: 120,
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
      field: 'hourly_rate', 
      headerName: 'Taxa/Hora', 
      width: 120,
      renderCell: (params) => (
        <Typography variant="body2">
          R$ {params.value?.toFixed(2) || '0.00'}
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
                setSelectedMechanic(params.row);
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
              onClick={() => handleDeleteMechanic(params.row.id)}
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
          Gerenciamento de Mecânicos
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog('create')}
          sx={{
            background: 'linear-gradient(135deg, #002F6C 0%, #1a4a8a 100%)',
            '&:hover': {
              background: 'linear-gradient(135deg, #1a4a8a 0%, #002F6C 100%)',
            }
          }}
        >
          Novo Mecânico
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
            rows={mechanics}
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

      {/* Dialog para criar/editar mecânico */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>
          {dialogMode === 'create' ? 'Novo Mecânico' : 'Editar Mecânico'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Nome da Empresa"
                value={formData.business_name}
                onChange={(e) => setFormData({ ...formData, business_name: e.target.value })}
                margin="normal"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Telefone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                margin="normal"
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
              <TextField
                fullWidth
                label="Endereço"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                margin="normal"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Latitude"
                value={formData.latitude}
                onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                margin="normal"
                type="number"
                inputProps={{ step: "any" }}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Longitude"
                value={formData.longitude}
                onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                margin="normal"
                type="number"
                inputProps={{ step: "any" }}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Taxa por Hora (R$)"
                value={formData.hourly_rate}
                onChange={(e) => setFormData({ ...formData, hourly_rate: e.target.value })}
                margin="normal"
                type="number"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Anos de Experiência"
                value={formData.experience_years}
                onChange={(e) => setFormData({ ...formData, experience_years: e.target.value })}
                margin="normal"
                type="number"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.emergency_service}
                    onChange={(e) => setFormData({ ...formData, emergency_service: e.target.checked })}
                  />
                }
                label="Serviço de Emergência"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.home_service}
                    onChange={(e) => setFormData({ ...formData, home_service: e.target.checked })}
                  />
                }
                label="Serviço em Casa"
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

      {/* Dialog para visualizar mecânico */}
      <Dialog open={openViewDialog} onClose={() => setOpenViewDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>Detalhes do Mecânico</DialogTitle>
        <DialogContent>
          {selectedMechanic && (
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom>
                  {selectedMechanic.business_name}
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {selectedMechanic.description}
                </Typography>
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Especialidades:
                  </Typography>
                  <Box>
                    {selectedMechanic.specialties?.map((specialty, index) => (
                      <Chip 
                        key={index} 
                        label={specialty} 
                        size="small" 
                        sx={{ mr: 0.5, mb: 0.5 }}
                      />
                    ))}
                  </Box>
                </Box>
              </Grid>
              <Grid item xs={12} md={6}>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Rating:
                  </Typography>
                  <Rating value={selectedMechanic.rating || 0} readOnly size="large" />
                  <Typography variant="body2" sx={{ ml: 1 }}>
                    {selectedMechanic.rating?.toFixed(1) || '0.0'}
                  </Typography>
                </Box>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Taxa por Hora:
                  </Typography>
                  <Typography variant="h6" color="primary">
                    R$ {selectedMechanic.hourly_rate?.toFixed(2) || '0.00'}
                  </Typography>
                </Box>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Status:
                  </Typography>
                  <Box>
                    <Chip 
                      icon={selectedMechanic.is_verified ? <VerifiedIcon /> : <UnverifiedIcon />}
                      label={selectedMechanic.is_verified ? 'Verificado' : 'Não Verificado'}
                      color={selectedMechanic.is_verified ? 'success' : 'default'}
                      sx={{ mr: 1 }}
                    />
                    <Chip 
                      label={selectedMechanic.is_available ? 'Disponível' : 'Indisponível'}
                      color={selectedMechanic.is_available ? 'success' : 'error'}
                    />
                  </Box>
                </Box>
              </Grid>
              <Grid item xs={12}>
                <Typography variant="subtitle2" gutterBottom>
                  Endereço:
                </Typography>
                <Box display="flex" alignItems="center">
                  <LocationIcon sx={{ mr: 1, color: 'text.secondary' }} />
                  <Typography variant="body2">
                    {selectedMechanic.address}
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

export default Mechanics;
