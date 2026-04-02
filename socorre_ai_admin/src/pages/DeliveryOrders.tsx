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
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
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
  LocalShipping,
  LocalGasStation,
  Build,
  Restaurant,
  MoreVert,
  DirectionsCar,
  AccessTime,
  AttachMoney,
} from '@mui/icons-material';
import apiService from '../services/api';
import { DeliveryOrder } from '../types';

const DeliveryOrders: React.FC = () => {
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<DeliveryOrder | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const loadOrders = async () => {
    try {
      setLoading(true);
      setError('');
      
      const filters: any = {};
      if (searchTerm) filters.search = searchTerm;
      if (typeFilter) filters.type = typeFilter;
      if (statusFilter) filters.status = statusFilter;
      if (urgencyFilter) filters.urgency = urgencyFilter;

      const response = await apiService.getDeliveryOrders({ page, limit: 10, ...filters });
      
      if (response.success && response.data) {
        setOrders(response.data.orders || []);
        setTotal(response.data.total || 0);
        setTotalPages(response.data.totalPages || 1);
      } else {
        setError('Erro ao carregar ordens de entrega');
      }
    } catch (err) {
      setError('Erro ao carregar ordens de entrega');
      console.error('Erro ao carregar ordens:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
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

  const handleViewOrder = (order: DeliveryOrder) => {
    setSelectedOrder(order);
    setViewDialogOpen(true);
  };

  const handleEditOrder = (order: DeliveryOrder) => {
    setSelectedOrder(order);
    setEditDialogOpen(true);
  };

  const handleDeleteOrder = (order: DeliveryOrder) => {
    setSelectedOrder(order);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedOrder) return;

    try {
      // Implementar delete quando a API estiver pronta
      setDeleteDialogOpen(false);
      setSelectedOrder(null);
      loadOrders();
    } catch (err) {
      console.error('Erro ao deletar ordem:', err);
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'fuel': return 'Combustível';
      case 'parts': return 'Peças';
      case 'food': return 'Comida';
      case 'other': return 'Outro';
      default: return type;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'fuel': return <LocalGasStation />;
      case 'parts': return <Build />;
      case 'food': return <Restaurant />;
      default: return <LocalShipping />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'fuel': return 'warning';
      case 'parts': return 'primary';
      case 'food': return 'success';
      default: return 'default';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return 'Pendente';
      case 'accepted': return 'Aceito';
      case 'picked_up': return 'Coletado';
      case 'in_transit': return 'Em Trânsito';
      case 'delivered': return 'Entregue';
      case 'cancelled': return 'Cancelado';
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'warning';
      case 'accepted': return 'info';
      case 'picked_up': return 'primary';
      case 'in_transit': return 'secondary';
      case 'delivered': return 'success';
      case 'cancelled': return 'error';
      default: return 'default';
    }
  };

  const getUrgencyLabel = (urgency?: string) => {
    switch (urgency) {
      case 'low': return 'Baixa';
      case 'medium': return 'Média';
      case 'high': return 'Alta';
      case 'urgent': return 'Urgente';
      default: return 'Não definida';
    }
  };

  const getUrgencyColor = (urgency?: string) => {
    switch (urgency) {
      case 'low': return 'success';
      case 'medium': return 'warning';
      case 'high': return 'error';
      case 'urgent': return 'error';
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

  const formatDuration = (minutes: number) => {
    if (minutes < 60) {
      return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}min`;
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
          Ordens de Entrega
        </Typography>
        <Box display="flex" gap={2}>
          <Button
            variant="outlined"
            startIcon={<LocalShipping />}
            onClick={() => setEditDialogOpen(true)}
          >
            Nova Ordem
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
                    {orders.filter(o => o.status === 'pending').length}
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
                <DirectionsCar color="primary" sx={{ mr: 1 }} />
                <Box>
                  <Typography variant="h6">
                    {orders.filter(o => o.status === 'in_transit').length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Em Trânsito
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
                    {orders.filter(o => o.status === 'delivered').length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Entregues
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
                <AttachMoney color="info" sx={{ mr: 1 }} />
                <Box>
                  <Typography variant="h6">
                    {formatCurrency(orders.reduce((sum, o) => sum + (o.total_price || 0), 0))}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Faturamento
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
                placeholder="Buscar ordens..."
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
                  <MenuItem value="fuel">Combustível</MenuItem>
                  <MenuItem value="parts">Peças</MenuItem>
                  <MenuItem value="food">Comida</MenuItem>
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
                  <MenuItem value="picked_up">Coletado</MenuItem>
                  <MenuItem value="in_transit">Em Trânsito</MenuItem>
                  <MenuItem value="delivered">Entregue</MenuItem>
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
                  <MenuItem value="urgent">Urgente</MenuItem>
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

      {/* Tabela de Ordens */}
      <Card>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>ID</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Cliente</TableCell>
                <TableCell>Motoboy</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Urgência</TableCell>
                <TableCell>Valor</TableCell>
                <TableCell>Tempo</TableCell>
                <TableCell>Data</TableCell>
                <TableCell>Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={order.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight="bold">
                      #{order.id}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Box display="flex" alignItems="center">
                      <Avatar
                        sx={{ 
                          width: 32, 
                          height: 32, 
                          mr: 1,
                          bgcolor: getTypeColor(order.type) + '.main'
                        }}
                      >
                        {getTypeIcon(order.type)}
                      </Avatar>
                      <Chip
                        label={getTypeLabel(order.type)}
                        color={getTypeColor(order.type) as any}
                        size="small"
                      />
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box>
                      <Typography variant="subtitle2" fontWeight="bold">
                        {order.user_name || 'Cliente'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {order.user_phone || 'Sem telefone'}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    {order.motoboy_name ? (
                      <Box>
                        <Typography variant="subtitle2" fontWeight="bold">
                          {order.motoboy_name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {order.motoboy_phone || 'Sem telefone'}
                        </Typography>
                      </Box>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        Não atribuído
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={getStatusLabel(order.status)}
                      color={getStatusColor(order.status) as any}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={getUrgencyLabel(order.urgency)}
                      color={getUrgencyColor(order.urgency) as any}
                      size="small"
                      variant={order.is_urgent ? "filled" : "outlined"}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight="bold">
                      {order.total_price ? formatCurrency(order.total_price) : 'A definir'}
                    </Typography>
                    {order.delivery_fee && (
                      <Typography variant="caption" color="text.secondary">
                        Taxa: {formatCurrency(order.delivery_fee)}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {order.actual_delivery_minutes ? (
                      <Box>
                        <Typography variant="body2" fontWeight="bold">
                          {formatDuration(order.actual_delivery_minutes)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Real
                        </Typography>
                      </Box>
                    ) : order.estimated_delivery_minutes ? (
                      <Box>
                        <Typography variant="body2">
                          {formatDuration(order.estimated_delivery_minutes)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Estimado
                        </Typography>
                      </Box>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        A definir
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {formatDate(order.created_at)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Box display="flex" gap={1}>
                      <Tooltip title="Visualizar">
                        <IconButton
                          size="small"
                          onClick={() => handleViewOrder(order)}
                        >
                          <Visibility />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Editar">
                        <IconButton
                          size="small"
                          onClick={() => handleEditOrder(order)}
                        >
                          <Edit />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Mais opções">
                        <IconButton
                          size="small"
                          onClick={() => handleDeleteOrder(order)}
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
          Detalhes da Ordem #{selectedOrder?.id}
        </DialogTitle>
        <DialogContent>
          {selectedOrder && (
            <Box>
              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <Typography variant="h6" gutterBottom>
                    Informações Básicas
                  </Typography>
                  <Box mb={2}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Tipo de Entrega
                    </Typography>
                    <Box display="flex" alignItems="center" mt={1}>
                      <Avatar
                        sx={{ 
                          width: 24, 
                          height: 24, 
                          mr: 1,
                          bgcolor: getTypeColor(selectedOrder.type) + '.main'
                        }}
                      >
                        {getTypeIcon(selectedOrder.type)}
                      </Avatar>
                      <Chip
                        label={getTypeLabel(selectedOrder.type)}
                        color={getTypeColor(selectedOrder.type) as any}
                        size="small"
                      />
                    </Box>
                  </Box>
                  
                  <Box mb={2}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Status
                    </Typography>
                    <Chip
                      label={getStatusLabel(selectedOrder.status)}
                      color={getStatusColor(selectedOrder.status) as any}
                      sx={{ mt: 1 }}
                    />
                  </Box>

                  <Box mb={2}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Urgência
                    </Typography>
                    <Chip
                      label={getUrgencyLabel(selectedOrder.urgency)}
                      color={getUrgencyColor(selectedOrder.urgency) as any}
                      variant={selectedOrder.is_urgent ? "filled" : "outlined"}
                      sx={{ mt: 1 }}
                    />
                  </Box>
                </Grid>

                <Grid item xs={12} md={6}>
                  <Typography variant="h6" gutterBottom>
                    Cliente
                  </Typography>
                  <Box mb={2}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Nome
                    </Typography>
                    <Typography variant="body1">
                      {selectedOrder.user_name || 'Não informado'}
                    </Typography>
                  </Box>
                  
                  <Box mb={2}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Telefone
                    </Typography>
                    <Typography variant="body1">
                      {selectedOrder.user_phone || 'Não informado'}
                    </Typography>
                  </Box>
                </Grid>

                {selectedOrder.motoboy_name && (
                  <Grid item xs={12} md={6}>
                    <Typography variant="h6" gutterBottom>
                      Motoboy
                    </Typography>
                    <Box mb={2}>
                      <Typography variant="subtitle2" color="text.secondary">
                        Nome
                      </Typography>
                      <Typography variant="body1">
                        {selectedOrder.motoboy_name}
                      </Typography>
                    </Box>
                    
                    <Box mb={2}>
                      <Typography variant="subtitle2" color="text.secondary">
                        Telefone
                      </Typography>
                      <Typography variant="body1">
                        {selectedOrder.motoboy_phone || 'Não informado'}
                      </Typography>
                    </Box>
                  </Grid>
                )}

                <Grid item xs={12}>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="h6" gutterBottom>
                    Itens
                  </Typography>
                  {selectedOrder.items && selectedOrder.items.length > 0 ? (
                    <List dense>
                      {selectedOrder.items.map((item: any, index: number) => (
                        <ListItem key={index}>
                          <ListItemIcon>
                            {getTypeIcon(selectedOrder.type)}
                          </ListItemIcon>
                          <ListItemText
                            primary={item.name || `Item ${index + 1}`}
                            secondary={`Quantidade: ${item.quantity || 1} - Preço: ${item.price ? formatCurrency(item.price) : 'A definir'}`}
                          />
                        </ListItem>
                      ))}
                    </List>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      {selectedOrder.items_description || 'Nenhum item especificado'}
                    </Typography>
                  )}
                </Grid>

                <Grid item xs={12} md={6}>
                  <Typography variant="h6" gutterBottom>
                    Local de Coleta
                  </Typography>
                  <Box display="flex" alignItems="center" mb={1}>
                    <LocationOn color="action" sx={{ mr: 1 }} />
                    <Typography variant="body1">
                      {selectedOrder.pickup_address || 'Não informado'}
                    </Typography>
                  </Box>
                  {selectedOrder.pickup_instructions && (
                    <Typography variant="body2" color="text.secondary">
                      Instruções: {selectedOrder.pickup_instructions}
                    </Typography>
                  )}
                </Grid>

                <Grid item xs={12} md={6}>
                  <Typography variant="h6" gutterBottom>
                    Local de Entrega
                  </Typography>
                  <Box display="flex" alignItems="center" mb={1}>
                    <LocationOn color="action" sx={{ mr: 1 }} />
                    <Typography variant="body1">
                      {selectedOrder.delivery_address || 'Não informado'}
                    </Typography>
                  </Box>
                  {selectedOrder.delivery_instructions && (
                    <Typography variant="body2" color="text.secondary">
                      Instruções: {selectedOrder.delivery_instructions}
                    </Typography>
                  )}
                </Grid>

                {selectedOrder.total_price && (
                  <Grid item xs={12}>
                    <Typography variant="h6" gutterBottom>
                      Valores
                    </Typography>
                    <Box display="flex" gap={2} flexWrap="wrap">
                      {selectedOrder.items_price && (
                        <Chip
                          label={`Itens: ${formatCurrency(selectedOrder.items_price)}`}
                          variant="outlined"
                        />
                      )}
                      {selectedOrder.delivery_fee && (
                        <Chip
                          label={`Taxa: ${formatCurrency(selectedOrder.delivery_fee)}`}
                          variant="outlined"
                        />
                      )}
                      <Chip
                        label={`Total: ${formatCurrency(selectedOrder.total_price)}`}
                        color="primary"
                        variant="filled"
                      />
                    </Box>
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
            Tem certeza que deseja excluir a ordem #{selectedOrder?.id}?
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

export default DeliveryOrders;
