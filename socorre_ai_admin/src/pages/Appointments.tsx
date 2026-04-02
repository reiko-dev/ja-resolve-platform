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
  FormControlLabel,
  Switch,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
  Schedule as ScheduleIcon,
  CheckCircle as CompletedIcon,
  Pending as PendingIcon,
  Build as BuildIcon,
  Person as PersonIcon,
} from '@mui/icons-material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import apiService from '../services/api';

interface Appointment {
  id: number;
  user_id: number;
  mechanic_id: number;
  service_id: number;
  scheduled_date: string;
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
  description: string;
  estimated_price: number;
  final_price: number;
  notes: string;
  created_at: string;
  updated_at: string;
}

const Appointments: React.FC = () => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [openViewDialog, setOpenViewDialog] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [formData, setFormData] = useState({
    scheduled_date: '',
    description: '',
    estimated_price: '',
    notes: '',
  });

  useEffect(() => {
    loadAppointments();
  }, []);

  const loadAppointments = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await apiService.getAppointments();
      if (response.success && response.data) {
        setAppointments(response.data.items || []);
      } else {
        setError(response.message || 'Erro ao carregar agendamentos');
      }
    } catch (err: any) {
      console.error('Erro ao carregar agendamentos:', err);
      setError(err.response?.data?.message || 'Erro de conexão com o servidor');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (mode: 'create' | 'edit', appointment?: Appointment) => {
    setDialogMode(mode);
    if (mode === 'edit' && appointment) {
      setSelectedAppointment(appointment);
      setFormData({
        scheduled_date: appointment.scheduled_date,
        description: appointment.description,
        estimated_price: appointment.estimated_price?.toString() || '',
        notes: appointment.notes || '',
      });
    } else {
      setSelectedAppointment(null);
      setFormData({
        scheduled_date: '',
        description: '',
        estimated_price: '',
        notes: '',
      });
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setSelectedAppointment(null);
    setFormData({
      scheduled_date: '',
      description: '',
      estimated_price: '',
      notes: '',
    });
  };

  const handleSubmit = async () => {
    try {
      if (dialogMode === 'create') {
        // Implementar criação
        console.log('Criar agendamento:', formData);
      } else {
        // Implementar edição
        console.log('Editar agendamento:', selectedAppointment?.id, formData);
      }
      handleCloseDialog();
      loadAppointments();
    } catch (err: any) {
      console.error('Erro ao salvar agendamento:', err);
      setError(err.response?.data?.message || 'Erro ao salvar agendamento');
    }
  };

  const handleStatusChange = async (appointmentId: number, newStatus: string) => {
    try {
      // Implementar mudança de status
      console.log('Mudar status:', appointmentId, newStatus);
      loadAppointments();
    } catch (err: any) {
      console.error('Erro ao mudar status:', err);
      setError(err.response?.data?.message || 'Erro ao mudar status');
    }
  };

  const handleDeleteAppointment = async (appointmentId: number) => {
    if (window.confirm('Tem certeza que deseja excluir este agendamento?')) {
      try {
        // Implementar exclusão
        console.log('Excluir agendamento:', appointmentId);
        loadAppointments();
      } catch (err: any) {
        console.error('Erro ao excluir agendamento:', err);
        setError(err.response?.data?.message || 'Erro ao excluir agendamento');
      }
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'warning';
      case 'confirmed': return 'info';
      case 'in_progress': return 'primary';
      case 'completed': return 'success';
      case 'cancelled': return 'error';
      default: return 'default';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <PendingIcon />;
      case 'confirmed': return <ScheduleIcon />;
      case 'in_progress': return <BuildIcon />;
      case 'completed': return <CompletedIcon />;
      case 'cancelled': return <PendingIcon />;
      default: return <ScheduleIcon />;
    }
  };

  const columns: GridColDef[] = [
    { field: 'id', headerName: 'ID', width: 70 },
    { 
      field: 'scheduled_date', 
      headerName: 'Data Agendada', 
      width: 150,
      renderCell: (params) => (
        <Box display="flex" alignItems="center">
          <ScheduleIcon sx={{ mr: 1, color: 'text.secondary', fontSize: 16 }} />
          <Typography variant="body2">
            {new Date(params.value).toLocaleDateString('pt-BR')}
          </Typography>
        </Box>
      )
    },
    { 
      field: 'status', 
      headerName: 'Status', 
      width: 150,
      renderCell: (params) => (
        <Chip 
          icon={getStatusIcon(params.value)}
          label={params.value === 'pending' ? 'Pendente' : 
                 params.value === 'confirmed' ? 'Confirmado' :
                 params.value === 'in_progress' ? 'Em Andamento' :
                 params.value === 'completed' ? 'Concluído' :
                 params.value === 'cancelled' ? 'Cancelado' : params.value}
          color={getStatusColor(params.value) as any}
          size="small"
        />
      )
    },
    { 
      field: 'estimated_price', 
      headerName: 'Preço Estimado', 
      width: 150,
      renderCell: (params) => (
        <Typography variant="body2" fontWeight="bold">
          R$ {params.value?.toFixed(2) || '0.00'}
        </Typography>
      )
    },
    { 
      field: 'final_price', 
      headerName: 'Preço Final', 
      width: 150,
      renderCell: (params) => (
        <Typography variant="body2" fontWeight="bold" color="primary">
          R$ {params.value?.toFixed(2) || '0.00'}
        </Typography>
      )
    },
    {
      field: 'actions',
      headerName: 'Ações',
      width: 250,
      sortable: false,
      renderCell: (params) => (
        <Box>
          <Tooltip title="Visualizar">
            <IconButton 
              size="small" 
              onClick={() => {
                setSelectedAppointment(params.row);
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
          <Tooltip title="Mudar Status">
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <Select
                value={params.row.status}
                onChange={(e) => handleStatusChange(params.row.id, e.target.value)}
                size="small"
              >
                <MenuItem value="pending">Pendente</MenuItem>
                <MenuItem value="confirmed">Confirmado</MenuItem>
                <MenuItem value="in_progress">Em Andamento</MenuItem>
                <MenuItem value="completed">Concluído</MenuItem>
                <MenuItem value="cancelled">Cancelado</MenuItem>
              </Select>
            </FormControl>
          </Tooltip>
          <Tooltip title="Excluir">
            <IconButton 
              size="small" 
              color="error"
              onClick={() => handleDeleteAppointment(params.row.id)}
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
          Gerenciamento de Agendamentos
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog('create')}
          sx={{
            background: 'linear-gradient(135deg, #FF9800 0%, #ffb74d 100%)',
            '&:hover': {
              background: 'linear-gradient(135deg, #ffb74d 0%, #FF9800 100%)',
            }
          }}
        >
          Novo Agendamento
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
            rows={appointments}
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

      {/* Dialog para criar/editar agendamento */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>
          {dialogMode === 'create' ? 'Novo Agendamento' : 'Editar Agendamento'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Data Agendada"
                type="datetime-local"
                value={formData.scheduled_date}
                onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })}
                margin="normal"
                InputLabelProps={{ shrink: true }}
                required
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Preço Estimado (R$)"
                value={formData.estimated_price}
                onChange={(e) => setFormData({ ...formData, estimated_price: e.target.value })}
                margin="normal"
                type="number"
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
                required
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Observações"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                margin="normal"
                multiline
                rows={2}
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

      {/* Dialog para visualizar agendamento */}
      <Dialog open={openViewDialog} onClose={() => setOpenViewDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>Detalhes do Agendamento</DialogTitle>
        <DialogContent>
          {selectedAppointment && (
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom>
                  Agendamento #{selectedAppointment.id}
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {selectedAppointment.description}
                </Typography>
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Status:
                  </Typography>
                  <Chip 
                    icon={getStatusIcon(selectedAppointment.status)}
                    label={selectedAppointment.status === 'pending' ? 'Pendente' : 
                           selectedAppointment.status === 'confirmed' ? 'Confirmado' :
                           selectedAppointment.status === 'in_progress' ? 'Em Andamento' :
                           selectedAppointment.status === 'completed' ? 'Concluído' :
                           selectedAppointment.status === 'cancelled' ? 'Cancelado' : selectedAppointment.status}
                    color={getStatusColor(selectedAppointment.status) as any}
                    size="medium"
                  />
                </Box>
              </Grid>
              <Grid item xs={12} md={6}>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Data Agendada:
                  </Typography>
                  <Typography variant="h6">
                    {new Date(selectedAppointment.scheduled_date).toLocaleDateString('pt-BR')}
                  </Typography>
                </Box>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Preço Estimado:
                  </Typography>
                  <Typography variant="h6" color="primary">
                    R$ {selectedAppointment.estimated_price?.toFixed(2) || '0.00'}
                  </Typography>
                </Box>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Preço Final:
                  </Typography>
                  <Typography variant="h6" color="success">
                    R$ {selectedAppointment.final_price?.toFixed(2) || '0.00'}
                  </Typography>
                </Box>
              </Grid>
              {selectedAppointment.notes && (
                <Grid item xs={12}>
                  <Typography variant="subtitle2" gutterBottom>
                    Observações:
                  </Typography>
                  <Typography variant="body2">
                    {selectedAppointment.notes}
                  </Typography>
                </Grid>
              )}
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

export default Appointments;
