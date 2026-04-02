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
  Wifi,
  WifiOff,
  Build,
  Store,
  TwoWheeler,
  ThumbUp,
  ThumbDown,
  LocalGasStation,
  LocalShipping,
} from '@mui/icons-material';
import apiService from '../services/api';
import { Partner } from '../types';
import PartnerForm from '../components/PartnerForm';

const Partners: React.FC = () => {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [partnerType, setPartnerType] = useState<'mechanic' | 'motoboy' | 'gas_station' | 'auto_parts' | 'tow'>('mechanic');

  const loadPartners = async () => {
    try {
      setLoading(true);
      setError('');
      
      const filters: any = {};
      if (searchTerm) filters.search = searchTerm;
      if (typeFilter) filters.type = typeFilter;
      if (statusFilter) filters.is_verified = statusFilter === 'verified';

      const response = await apiService.getPartners({ page, limit: 10, ...filters });
      
      if (response.success && response.data) {
        setPartners(response.data.partners || response.data);
        setTotalPages(response.data.totalPages || 1);
        setTotal(response.data.total || 0);
      }
    } catch (err) {
      console.error('Erro ao carregar parceiros:', err);
      setError('Erro ao carregar lista de parceiros');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPartners();
  }, [page, searchTerm, typeFilter, statusFilter]);

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

  const handleViewPartner = (partner: Partner) => {
    setSelectedPartner(partner);
    setViewDialogOpen(true);
  };

  const handleEditPartner = (partner: Partner) => {
    setSelectedPartner(partner);
    setPartnerType(partner.type);
    setEditDialogOpen(true);
  };

  const handleDeletePartner = (partner: Partner) => {
    setSelectedPartner(partner);
    setDeleteDialogOpen(true);
  };

  const handleInputChange = (event: any) => {
    const { name, value } = event.target;
    setSelectedPartner(prev => ({
      ...prev,
      [name]: value
    } as Partner));
  };

  const handleCreatePartner = async (event: any) => {
    event.preventDefault();
    
    try {
      if (selectedPartner) {
        // Atualizar parceiro existente
        await apiService.updatePartner(selectedPartner.id, selectedPartner);
      } else {
        // Criar novo parceiro
        await apiService.createPartner(selectedPartner);
      }
      
      setEditDialogOpen(false);
      setSelectedPartner(null);
      loadPartners();
    } catch (err) {
      console.error('Erro ao cadastrar parceiro:', err);
      setError('Erro ao cadastrar parceiro');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!selectedPartner) return;

    try {
      await apiService.deleteUser(selectedPartner.user_id);
      setDeleteDialogOpen(false);
      setSelectedPartner(null);
      loadPartners();
    } catch (err) {
      console.error('Erro ao deletar parceiro:', err);
    }
  };

  const handleApprovePartner = async (partner: Partner) => {
    try {
      await apiService.approvePartner(partner.id, true);
      loadPartners();
    } catch (err) {
      console.error('Erro ao aprovar parceiro:', err);
    }
  };

  const handleRejectPartner = async (partner: Partner) => {
    try {
      await apiService.approvePartner(partner.id, false);
      loadPartners();
    } catch (err) {
      console.error('Erro ao rejeitar parceiro:', err);
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'mechanic': return 'Mecânico';
      case 'motoboy': return 'Motoboy';
      case 'gas_station': return 'Posto de Combustível';
      case 'auto_parts': return 'Auto Peças';
      case 'tow': return 'Guincho';
      default: return type;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'mechanic': return 'primary';
      case 'motoboy': return 'secondary';
      case 'gas_station': return 'warning';
      case 'auto_parts': return 'success';
      case 'tow': return 'error';
      default: return 'default';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'mechanic': return <Build />;
      case 'motoboy': return <TwoWheeler />;
      case 'gas_station': return <LocalGasStation />;
      case 'auto_parts': return <Store />;
      case 'tow': return <LocalShipping />;
      default: return null;
    }
  };

  const getStatusChip = (partner: Partner) => {
    if (!partner.is_verified) {
      return <Chip label="Não Verificado" color="warning" size="small" />;
    }
    if (!partner.is_available) {
      return <Chip label="Indisponível" color="error" size="small" />;
    }
    if (partner.is_online) {
      return <Chip label="Online" color="success" size="small" icon={<Wifi />} />;
    }
    return <Chip label="Offline" color="default" size="small" icon={<WifiOff />} />;
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
          Parceiros
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} md={3}>
            <FormControl fullWidth>
              <InputLabel>Tipo de Parceiro</InputLabel>
              <Select
                value={partnerType}
                onChange={(e) => setPartnerType(e.target.value as any)}
                label="Tipo de Parceiro"
              >
                <MenuItem value="mechanic">Mecânico</MenuItem>
                <MenuItem value="motoboy">Motoboy</MenuItem>
                <MenuItem value="gas_station">Posto de Combustível</MenuItem>
                <MenuItem value="auto_parts">Auto Peças</MenuItem>
                <MenuItem value="tow">Guincho</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={3}>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => {
                setSelectedPartner(null);
                setEditDialogOpen(true);
              }}
              fullWidth
              sx={{ height: 56 }}
            >
              Novo {partnerType === 'mechanic' ? 'Mecânico' : 
                    partnerType === 'motoboy' ? 'Motoboy' :
                    partnerType === 'gas_station' ? 'Posto de Combustível' :
                    partnerType === 'auto_parts' ? 'Auto Peças' : 'Guincho'}
            </Button>
          </Grid>
        </Grid>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Filtros */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Filtros
            </Typography>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  placeholder="Buscar parceiros..."
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
              <Grid item xs={12} md={3}>
                <FormControl fullWidth>
                  <InputLabel>Tipo</InputLabel>
                  <Select
                    value={typeFilter}
                    onChange={handleTypeFilter}
                    label="Tipo"
                  >
                    <MenuItem value="">Todos</MenuItem>
                    <MenuItem value="mechanic">Mecânicos</MenuItem>
                    <MenuItem value="motoboy">Motoboys</MenuItem>
                    <MenuItem value="gas_station">Postos de Combustível</MenuItem>
                    <MenuItem value="auto_parts">Auto Peças</MenuItem>
                    <MenuItem value="tow">Guinchos</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={3}>
                <FormControl fullWidth>
                  <InputLabel>Status</InputLabel>
                  <Select
                    value={statusFilter}
                    onChange={handleStatusFilter}
                    label="Status"
                  >
                    <MenuItem value="">Todos</MenuItem>
                    <MenuItem value="verified">Verificados</MenuItem>
                    <MenuItem value="unverified">Não Verificados</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={2}>
                <Button
                  fullWidth
                  variant="outlined"
                  startIcon={<FilterList />}
                  onClick={() => {
                    setSearchTerm('');
                    setTypeFilter('');
                    setStatusFilter('');
                    setPage(1);
                  }}
                >
                  Limpar
                </Button>
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        {/* Tabela de Parceiros */}
        <Card>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Parceiro</TableCell>
                  <TableCell>Tipo</TableCell>
                  <TableCell>Localização</TableCell>
                  <TableCell>Contato</TableCell>
                  <TableCell>Rating</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Ações</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {partners.map((partner) => (
                  <TableRow key={partner.id} hover>
                    <TableCell>
                      <Box display="flex" alignItems="center">
                        <Avatar
                          sx={{ 
                            width: 40, 
                            height: 40, 
                            mr: 2,
                            bgcolor: getTypeColor(partner.type) + '.main'
                          }}
                        >
                          {partner.business_name.charAt(0).toUpperCase()}
                        </Avatar>
                        <Box>
                          <Typography variant="subtitle2" fontWeight="bold">
                            {partner.business_name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {partner.user_name}
                          </Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Box display="flex" alignItems="center" gap={1}>
                        {getTypeIcon(partner.type)}
                        <Chip
                          label={getTypeLabel(partner.type)}
                          color={getTypeColor(partner.type) as any}
                          size="small"
                        />
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Box display="flex" alignItems="center">
                        <LocationOn fontSize="small" color="action" sx={{ mr: 0.5 }} />
                        <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                          {partner.address}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Box>
                        <Box display="flex" alignItems="center" mb={0.5}>
                          <Phone fontSize="small" color="action" sx={{ mr: 0.5 }} />
                          <Typography variant="body2">{partner.phone}</Typography>
                        </Box>
                        {partner.whatsapp && (
                          <Box display="flex" alignItems="center">
                            <Phone fontSize="small" color="action" sx={{ mr: 0.5 }} />
                            <Typography variant="body2" color="text.secondary">
                              {partner.whatsapp}
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Box display="flex" alignItems="center">
                        <Star fontSize="small" color="warning" sx={{ mr: 0.5 }} />
                        <Typography variant="body2">
                          {partner.rating.toFixed(1)} ({partner.total_reviews})
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      {getStatusChip(partner)}
                    </TableCell>
                    <TableCell>
                      <Box display="flex" gap={1} flexWrap="wrap">
                        <Tooltip title="Visualizar">
                          <IconButton
                            size="small"
                            onClick={() => handleViewPartner(partner)}
                          >
                            <Visibility />
                          </IconButton>
                        </Tooltip>
                        
                        {!partner.is_verified && (
                          <>
                            <Tooltip title="Aprovar">
                              <IconButton
                                size="small"
                                color="success"
                                onClick={() => handleApprovePartner(partner)}
                              >
                                <ThumbUp />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Rejeitar">
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => handleRejectPartner(partner)}
                              >
                                <ThumbDown />
                              </IconButton>
                            </Tooltip>
                          </>
                        )}
                        
                        <Tooltip title="Editar">
                          <IconButton
                            size="small"
                            onClick={() => handleEditPartner(partner)}
                          >
                            <Edit />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Deletar">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleDeletePartner(partner)}
                          >
                            <Delete />
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
            Detalhes do Parceiro
          </DialogTitle>
          <DialogContent>
            {selectedPartner && (
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle2" gutterBottom>
                    Informações Básicas
                  </Typography>
                  <Box>
                    <Typography variant="body2">
                      <strong>Nome:</strong> {selectedPartner.business_name}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Responsável:</strong> {selectedPartner.user_name}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Email:</strong> {selectedPartner.user_email}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Telefone:</strong> {selectedPartner.phone}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Tipo:</strong> {getTypeLabel(selectedPartner.type)}
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle2" gutterBottom>
                    Status e Avaliação
                  </Typography>
                  <Box>
                    <Typography variant="body2">
                      <strong>Status:</strong> {getStatusChip(selectedPartner)}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Avaliação:</strong> {selectedPartner.rating.toFixed(1)} ({selectedPartner.total_reviews} avaliações)
                    </Typography>
                    <Typography variant="body2">
                      <strong>Serviços:</strong> {selectedPartner.total_services}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Disponibilidade:</strong> {selectedPartner.is_available ? 'Disponível' : 'Indisponível'}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Online:</strong> {selectedPartner.is_online ? 'Sim' : 'Não'}
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setViewDialogOpen(false)}>
              Fechar
            </Button>
          </DialogActions>
        </Dialog>

        {/* Dialog de Cadastro/Edição */}
        <Dialog
          open={editDialogOpen}
          onClose={() => setEditDialogOpen(false)}
          maxWidth="lg"
          fullWidth
        >
          <DialogTitle>
            {selectedPartner ? 'Editar Parceiro' : `Novo ${partnerType === 'mechanic' ? 'Mecânico' : 
                  partnerType === 'motoboy' ? 'Motoboy' :
                  partnerType === 'gas_station' ? 'Posto de Combustível' :
                  partnerType === 'auto_parts' ? 'Auto Peças' : 'Guincho'}`}
          </DialogTitle>
          <DialogContent>
            <PartnerForm
              partnerType={partnerType}
              formData={selectedPartner || {}}
              onChange={setSelectedPartner}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="contained" color="primary">
              {selectedPartner ? 'Atualizar' : 'Cadastrar'}
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
              Tem certeza que deseja excluir o parceiro "{selectedPartner?.business_name}"?
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

export default Partners;
