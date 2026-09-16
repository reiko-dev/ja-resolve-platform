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

export function normalizeNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.trim().replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

export function normalizeSpecialties(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((s) => String(s)).filter(Boolean);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map((s) => String(s)).filter(Boolean);
    } catch {
      // não é JSON, continua para split por vírgula
    }
    if (trimmed.startsWith('[')) return [];
    return trimmed.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

export function normalizeMechanic(raw: any): Mechanic {
  return {
    ...raw,
    rating: normalizeNumber(raw?.rating, 0),
    hourly_rate: normalizeNumber(raw?.hourly_rate, 0),
    specialties: normalizeSpecialties(raw?.specialties),
  };
}

const Mechanics: React.FC = () => {
  const [mechanics, setMechanics] = useState<Mechanic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [openViewDialog, setOpenViewDialog] = useState(false);
  const [selectedMechanic, setSelectedMechanic] = useState<Mechanic | null>(null);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [formSubmitError, setFormSubmitError] = useState('');
  const [formData, setFormData] = useState({
    business_name: '',
    description: '',
    address: '',
    latitude: '',
    longitude: '',
    phone: '',
    email: '',
    hourly_rate: '',
    experience_years: '',
    emergency_service: false,
    home_service: false,
    workshop_service: true,
  });
  const [specialtiesInput, setSpecialtiesInput] = useState('');

  useEffect(() => {
    loadMechanics();
  }, []);

  const loadMechanics = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await apiService.getPartners({ type: 'mechanic', page: 1, limit: 10 });
      if (response?.success && response.data) {
        // GET /partners retorna { success, data: [...], pagination }
        const rawList: any[] = Array.isArray(response.data)
          ? response.data
          : Array.isArray((response.data as any)?.items)
            ? (response.data as any).items
            : [];
        setMechanics(rawList.map(normalizeMechanic));
      } else {
        setError(response?.message || 'Erro ao carregar mecânicos');
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
    setFormErrors({});
    setFormSubmitError('');
    if (mode === 'edit' && mechanic) {
      setSelectedMechanic(mechanic);
      const specialties = normalizeSpecialties(mechanic.specialties);
      setSpecialtiesInput(specialties.join(', '));
      setFormData({
      business_name: mechanic.business_name || '',
      description: mechanic.description || '',
      address: mechanic.address || '',
        latitude: mechanic.latitude?.toString() || '',
        longitude: mechanic.longitude?.toString() || '',
      phone: mechanic.phone || '',
        email: mechanic.email,
        hourly_rate: mechanic.hourly_rate?.toString() || '',
        experience_years: mechanic.experience_years?.toString() || '',
        emergency_service: mechanic.emergency_service,
        home_service: mechanic.home_service,
        workshop_service: (mechanic as any).workshop_service ?? true,
      });
    } else {
      setSelectedMechanic(null);
      setSpecialtiesInput('');
      setFormData({
        business_name: '',
        description: '',
        address: '',
        latitude: '',
        longitude: '',
        phone: '',
        email: '',
        hourly_rate: '',
        experience_years: '',
        emergency_service: false,
        home_service: false,
        workshop_service: true,
      });
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    if (saving) return;
    setOpenDialog(false);
    setSelectedMechanic(null);
    setFormErrors({});
    setFormSubmitError('');
    setSpecialtiesInput('');
    setFormData({
      business_name: '',
      description: '',
      address: '',
      latitude: '',
      longitude: '',
      phone: '',
      email: '',
      hourly_rate: '',
      experience_years: '',
      emergency_service: false,
      home_service: false,
      workshop_service: true,
    });
  };

  const validateForm = (): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (!(formData.business_name || '').trim() || (formData.business_name || '').trim().length < 2) {
      errors.business_name = 'Informe o nome do negócio (mínimo 2 caracteres)';
    }
    const phone = (formData.phone || '').trim();
    if (!phone) {
      errors.phone = 'Telefone é obrigatório';
    } else {
      const digits = phone.replace(/\D/g, '');
      if (digits.length < 8 || digits.length > 15) {
        errors.phone = 'Telefone inválido';
      }
    }
    if (normalizeSpecialties(specialtiesInput).length === 0) {
      errors.specialties = 'Informe ao menos uma especialidade';
    }
    if (!(formData.address || '').trim()) {
      errors.address = 'Endereço é obrigatório';
    }
    return errors;
  };

  const handleSubmit = async () => {
    if (saving) return;
    const errors = validateForm();
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSaving(true);
    setFormSubmitError('');
    try {
      const payload = {
        business_name: (formData.business_name || '').trim(),
        description: (formData.description || '').trim() || null,
        specialties: normalizeSpecialties(specialtiesInput),
        address: (formData.address || '').trim(),
        latitude: formData.latitude === '' ? undefined : Number(formData.latitude),
        longitude: formData.longitude === '' ? undefined : Number(formData.longitude),
        phone: (formData.phone || '').replace(/\D/g, ''),
        hourly_rate: formData.hourly_rate === '' ? undefined : Number(formData.hourly_rate),
        experience_years: formData.experience_years === '' ? undefined : Number(formData.experience_years),
        emergency_service: formData.emergency_service,
        home_service: formData.home_service,
        workshop_service: formData.workshop_service,
      };
      if (dialogMode === 'create') {
        await apiService.createAdminMechanic({ type: 'mechanic', ...payload });
      } else if (selectedMechanic) {
        await apiService.updateAdminMechanic(selectedMechanic.id, payload);
      }
      setOpenDialog(false);
      setSelectedMechanic(null);
      setFormErrors({});
      setSpecialtiesInput('');
      setFormData({
        business_name: '',
        description: '',
        address: '',
        latitude: '',
        longitude: '',
        phone: '',
        email: '',
        hourly_rate: '',
        experience_years: '',
        emergency_service: false,
        home_service: false,
        workshop_service: true,
      });
      await loadMechanics();
    } catch (err: any) {
      console.error('Erro ao salvar mecânico:', err);
      setFormSubmitError(err.response?.data?.message || 'Erro ao salvar mecânico');
    } finally {
      setSaving(false);
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
          {normalizeSpecialties(params.value)?.map((specialty: string, index: number) => (
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
      renderCell: (params) => {
        const ratingValue = normalizeNumber(params.value, 0);
        return (
          <Box display="flex" alignItems="center">
            <Rating value={ratingValue} readOnly size="small" />
            <Typography variant="body2" sx={{ ml: 1 }}>
              {ratingValue.toFixed(1)}
            </Typography>
          </Box>
        );
      }
    },
    { 
      field: 'hourly_rate', 
      headerName: 'Taxa/Hora', 
      width: 120,
      renderCell: (params) => {
        const rateValue = normalizeNumber(params.value, 0);
        return (
          <Typography variant="body2">
            R$ {rateValue.toFixed(2)}
          </Typography>
        );
      }
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
              aria-label="Visualizar"
              onClick={() => {
                setSelectedMechanic(normalizeMechanic(params.row));
                setOpenViewDialog(true);
              }}
            >
              <ViewIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Editar">
            <IconButton 
              size="small" 
              aria-label="Editar"
              onClick={() => handleOpenDialog('edit', params.row)}
            >
              <EditIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Excluir">
            <IconButton 
              size="small"
              color="error"
              aria-label="Excluir"
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
          {formSubmitError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {formSubmitError}
            </Alert>
          )}
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Nome do Negócio"
                value={formData.business_name}
                onChange={(e) => setFormData({ ...formData, business_name: e.target.value })}
                margin="normal"
                error={!!formErrors.business_name}
                helperText={formErrors.business_name}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Telefone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                margin="normal"
                error={!!formErrors.phone}
                helperText={formErrors.phone}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Especialidades (separadas por vírgula)"
                value={specialtiesInput}
                onChange={(e) => setSpecialtiesInput(e.target.value)}
                margin="normal"
                error={!!formErrors.specialties}
                helperText={formErrors.specialties || 'Ex: Motor, Freios, Suspensão'}
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
                error={!!formErrors.address}
                helperText={formErrors.address}
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
            <Grid item xs={12} md={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.workshop_service}
                    onChange={(e) => setFormData({ ...formData, workshop_service: e.target.checked })}
                  />
                }
                label="Serviço na Oficina"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSubmit} variant="contained" disabled={saving}>
            {saving ? 'Salvando...' : dialogMode === 'create' ? 'Criar' : 'Salvar'}
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
                    {normalizeSpecialties(selectedMechanic.specialties)?.map((specialty, index) => (
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
                  <Rating value={normalizeNumber(selectedMechanic.rating, 0)} readOnly size="large" />
                  <Typography variant="body2" sx={{ ml: 1 }}>
                    {normalizeNumber(selectedMechanic.rating, 0).toFixed(1)}
                  </Typography>
                </Box>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Taxa por Hora:
                  </Typography>
                  <Typography variant="h6" color="primary">
                    R$ {normalizeNumber(selectedMechanic.hourly_rate, 0).toFixed(2)}
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
