import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  IconButton,
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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Avatar,
  Tooltip,
  Alert,
  CircularProgress,
  Pagination,
  InputAdornment,
  Badge,
  Divider,
} from '@mui/material';
import {
  Add,
  Edit,
  Delete,
  Visibility,
  Search,
  FilterList,
  LocationOn,
  Phone,
  Email,
  Star,
  CheckCircle,
  Cancel,
  Schedule,
  LocalHospital,
  DirectionsCar,
  LocalGasStation,
  BatteryChargingFull,
  Build,
  MoreVert,
} from '@mui/icons-material';
import apiService from '../services/api';
import { EmergencyRequest } from '../types';

const EmergencyRequests: React.FC = () => {
  const [requests, setRequests] = useState<EmergencyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<EmergencyRequest | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const loadRequests = async () => {
    try {
      setLoading(true);
      setError('');
      
      const filters: any = {};
      if (searchTerm) filters.search = searchTerm;
      if (typeFilter) filters.type = typeFilter;
      if (statusFilter) filters.status = statusFilter;
      if (urgencyFilter) filters.urgency = urgencyFilter;

      const response = await apiService.getEmergencyRequests({ page, limit: 10, ...filters });
      
      if (response.success && response.data) {
        setRequests(response.data.requests || []);
        setTotal(response.data.total || 0);
        setTotalPages(response.data.totalPages || 1);
      } else {
        setError('Erro ao carregar solicitações de emergência');
      }
    } catch (err) {
      setError('Erro ao carregar solicitações de emergência');
      console.error('Erro ao carregar solicitações:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, [page, searchTerm, typeFilter, statusFilter, urgencyFilter]);

  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
    setPage(1);
  };

  const handleTypeFilter = (event: any) => {
    setTypeFilter(event.target.value);
    setPage(1);
  };

  const handleStatusFilter = (event: any) => {
    setStatusFilter(event.target.value);
    setPage(1);
  };

  const handleUrgencyFilter = (event: any) => {
    setUrgencyFilter(event.target.value);
    setPage(1);
  };

  const handleViewRequest = (request: EmergencyRequest) => {
    setSelectedRequest(request);
    setViewDialogOpen(true);
  };

  const handleEditRequest = (request: EmergencyRequest) => {
    setSelectedRequest(request);
    setEditDialogOpen(true);
  };

  const handleDeleteRequest = (request: EmergencyRequest) => {
    setSelectedRequest(request);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedRequest) return;

    try {
      // Implementar delete quando a API estiver pronta
      setDeleteDialogOpen(false);
      setSelectedRequest(null);
      loadRequests();
    } catch (err) {
      console.error('Erro ao deletar solicitação:', err);
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'mechanical': return 'Mecânico';
      case 'fuel': return 'Combustível';
      case 'tire': return 'Pneu';
      case 'battery': return 'Bateria';
      case 'other': return 'Outro';
      default: return type;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'mechanical': return <Build />;
      case 'fuel': return <LocalGasStation />;
      case 'tire': return <DirectionsCar />;
      case 'battery': return <BatteryChargingFull />;
      default: return <LocalHospital />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'mechanical': return 'primary';
      case 'fuel': return 'warning';
      case 'tire': return 'info';
      case 'battery': return 'secondary';
      default: return 'default';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return 'Pendente';
      case 'accepted': return 'Aceito';
      case 'in_progress': return 'Em Andamento';
      case 'completed': return 'Concluído';
      case 'cancelled': return 'Cancelado';
      case 'expired': return 'Expirado';
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'warning';
      case 'accepted': return 'info';
      case 'in_progress': return 'primary';
      case 'completed': return 'success';
      case 'cancelled': return 'error';
      case 'expired': return 'default';
      default: return 'default';
    }
  };

  const getUrgencyLabel = (urgency: string) => {
    switch (urgency) {
      case 'low': return 'Baixa';
      case 'medium': return 'Média';
      case 'high': return 'Alta';
      case 'critical': return 'Crítica';
      default: return urgency;
    }
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'low': return 'success';
      case 'medium': return 'warning';
      case 'high': return 'error';
      case 'critical': return 'error';
      default: return 'default';
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('pt-BR');
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" component="h1" fontWeight="bold">
          Solicitações de Emergência
        </Typography>
        <Box display="flex" gap={2}>
          <Button
            variant="outlined"
            startIcon={<LocalHospital />}
            onClick={() => setEditDialogOpen(true)}
          >
            Nova Solicitação
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Estatísticas Rápidas */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center">
                <Schedule color="warning" sx={{ mr: 1 }} />
                <Box>
                  <Typography variant="h6">
                    {requests.filter(r => r.status === 'pending').length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Pendentes
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center">
                <CheckCircle color="primary" sx={{ mr: 1 }} />
                <Box>
                  <Typography variant="h6">
                    {requests.filter(r => r.status === 'in_progress').length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Em Andamento
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center">
                <CheckCircle color="success" sx={{ mr: 1 }} />
                <Box>
                  <Typography variant="h6">
                    {requests.filter(r => r.status === 'completed').length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Concluídas
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center">
                <LocalHospital color="error" sx={{ mr: 1 }} />
                <Box>
                  <Typography variant="h6">
                    {requests.filter(r => r.urgency === 'critical').length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Críticas
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filtros */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={3}>
              <TextField
                fullWidth
                placeholder="Buscar solicitações..."
                value={searchTerm}
                onChange={handleSearch}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search />
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
            <Grid item xs={12} md={2}>
              <FormControl fullWidth>
                <InputLabel>Tipo</InputLabel>
                <Select
                  value={typeFilter}
                  onChange={handleTypeFilter}
                  label="Tipo"
                >
                  <MenuItem value="">Todos</MenuItem>
                  <MenuItem value="mechanical">Mecânico</MenuItem>
                  <MenuItem value="fuel">Combustível</MenuItem>
                  <MenuItem value="tire">Pneu</MenuItem>
                  <MenuItem value="battery">Bateria</MenuItem>
                  <MenuItem value="other">Outro</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={2}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select
                  value={statusFilter}
                  onChange={handleStatusFilter}
                  label="Status"
                >
                  <MenuItem value="">Todos</MenuItem>
                  <MenuItem value="pending">Pendente</MenuItem>
                  <MenuItem value="accepted">Aceito</MenuItem>
                  <MenuItem value="in_progress">Em Andamento</MenuItem>
                  <MenuItem value="completed">Concluído</MenuItem>
                  <MenuItem value="cancelled">Cancelado</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={2}>
              <FormControl fullWidth>
                <InputLabel>Urgência</InputLabel>
                <Select
                  value={urgencyFilter}
                  onChange={handleUrgencyFilter}
                  label="Urgência"
                >
                  <MenuItem value="">Todas</MenuItem>
                  <MenuItem value="low">Baixa</MenuItem>
                  <MenuItem value="medium">Média</MenuItem>
                  <MenuItem value="high">Alta</MenuItem>
                  <MenuItem value="critical">Crítica</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={3}>
              <Button
                fullWidth
                variant="outlined"
                startIcon={<FilterList />}
                onClick={() => {
                  setSearchTerm('');
                  setTypeFilter('');
                  setStatusFilter('');
                  setUrgencyFilter('');
                  setPage(1);
                }}
              >
                Limpar Filtros
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Tabela de Solicitações */}
      <Card>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>ID</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Usuário</TableCell>
                <TableCell>Localização</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Urgência</TableCell>
                <TableCell>Valor</TableCell>
                <TableCell>Data</TableCell>
                <TableCell>Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {requests.map((request) => (
                <TableRow key={request.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight="bold">
                      #{request.id}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Box display="flex" alignItems="center">
                      <Avatar
                        sx={{ 
                          width: 32, 
                          height: 32, 
                          mr: 1,
                          bgcolor: getTypeColor(request.type) + '.main'
                        }}
                      >
                        {getTypeIcon(request.type)}
                      </Avatar>
                      <Chip
                        label={getTypeLabel(request.type)}
                        color={getTypeColor(request.type) as any}
                        size="small"
                      />
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box>
                      <Typography variant="subtitle2" fontWeight="bold">
                        {request.user_name || 'Usuário'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {request.user_phone || 'Sem telefone'}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box display="flex" alignItems="center">
                      <LocationOn fontSize="small" color="action" sx={{ mr: 0.5 }} />
                      <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                        {request.address}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={getStatusLabel(request.status)}
                      color={getStatusColor(request.status) as any}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={getUrgencyLabel(request.urgency)}
                      color={getUrgencyColor(request.urgency) as any}
                      size="small"
                      variant={request.is_urgent ? "filled" : "outlined"}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight="bold">
                      {request.final_price ? formatCurrency(request.final_price) : 
                       request.estimated_price ? formatCurrency(request.estimated_price) : 
                       'A definir'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {formatDate(request.created_at)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Box display="flex" gap={1}>
                      <Tooltip title="Visualizar">
                        <IconButton
                          size="small"
                          onClick={() => handleViewRequest(request)}
                        >
                          <Visibility />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Editar">
                        <IconButton
                          size="small"
                          onClick={() => handleEditRequest(request)}
                        >
                          <Edit />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Mais opções">
                        <IconButton
                          size="small"
                          onClick={() => handleDeleteRequest(request)}
                        >
                          <MoreVert />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Paginação */}
        {totalPages > 1 && (
          <Box display="flex" justifyContent="center" p={2}>
            <Pagination
              count={totalPages}
              page={page}
              onChange={(_, newPage) => setPage(newPage)}
              color="primary"
            />
          </Box>
        )}
      </Card>

      {/* Dialog de Visualização */}
      <Dialog
        open={viewDialogOpen}
        onClose={() => setViewDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Detalhes da Solicitação #{selectedRequest?.id}
        </DialogTitle>
        <DialogContent>
          {selectedRequest && (
            <Box>
              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <Typography variant="h6" gutterBottom>
                    Informações Básicas
                  </Typography>
                  <Box mb={2}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Tipo de Serviço
                    </Typography>
                    <Box display="flex" alignItems="center" mt={1}>
                      <Avatar
                        sx={{ 
                          width: 24, 
                          height: 24, 
                          mr: 1,
                          bgcolor: getTypeColor(selectedRequest.type) + '.main'
                        }}
                      >
                        {getTypeIcon(selectedRequest.type)}
                      </Avatar>
                      <Chip
                        label={getTypeLabel(selectedRequest.type)}
                        color={getTypeColor(selectedRequest.type) as any}
                        size="small"
                      />
                    </Box>
                  </Box>
                  
                  <Box mb={2}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Status
                    </Typography>
                    <Chip
                      label={getStatusLabel(selectedRequest.status)}
                      color={getStatusColor(selectedRequest.status) as any}
                      sx={{ mt: 1 }}
                    />
                  </Box>

                  <Box mb={2}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Urgência
                    </Typography>
                    <Chip
                      label={getUrgencyLabel(selectedRequest.urgency)}
                      color={getUrgencyColor(selectedRequest.urgency) as any}
                      variant={selectedRequest.is_urgent ? "filled" : "outlined"}
                      sx={{ mt: 1 }}
                    />
                  </Box>
                </Grid>

                <Grid item xs={12} md={6}>
                  <Typography variant="h6" gutterBottom>
                    Usuário
                  </Typography>
                  <Box mb={2}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Nome
                    </Typography>
                    <Typography variant="body1">
                      {selectedRequest.user_name || 'Não informado'}
                    </Typography>
                  </Box>
                  
                  <Box mb={2}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Telefone
                    </Typography>
                    <Typography variant="body1">
                      {selectedRequest.user_phone || 'Não informado'}
                    </Typography>
                  </Box>
                </Grid>

                <Grid item xs={12}>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="h6" gutterBottom>
                    Descrição do Problema
                  </Typography>
                  <Typography variant="body1" sx={{ mb: 2 }}>
                    {selectedRequest.description}
                  </Typography>
                </Grid>

                <Grid item xs={12}>
                  <Typography variant="h6" gutterBottom>
                    Localização
                  </Typography>
                  <Box display="flex" alignItems="center" mb={1}>
                    <LocationOn color="action" sx={{ mr: 1 }} />
                    <Typography variant="body1">
                      {selectedRequest.address}
                    </Typography>
                  </Box>
                  {selectedRequest.landmarks && (
                    <Typography variant="body2" color="text.secondary">
                      Referência: {selectedRequest.landmarks}
                    </Typography>
                  )}
                </Grid>

                {selectedRequest.final_price && (
                  <Grid item xs={12}>
                    <Typography variant="h6" gutterBottom>
                      Valor Final
                    </Typography>
                    <Typography variant="h5" color="primary" fontWeight="bold">
                      {formatCurrency(selectedRequest.final_price)}
                    </Typography>
                  </Grid>
                )}
              </Grid>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewDialogOpen(false)}>
            Fechar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog de Confirmação de Exclusão */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <DialogTitle>
          Confirmar Exclusão
        </DialogTitle>
        <DialogContent>
          <Typography>
            Tem certeza que deseja excluir a solicitação #{selectedRequest?.id}?
            Esta ação não pode ser desfeita.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Excluir
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default EmergencyRequests;
