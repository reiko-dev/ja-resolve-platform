import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  CircularProgress,
  Alert,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import {
  Warning,
  CheckCircle,
  Cancel,
  HourglassEmpty,
} from '@mui/icons-material';
import apiService from '../services/api';

interface Dispute {
  id: number;
  payment_id: number;
  user_id: number;
  partner_id: number;
  type: string;
  reason: string;
  description?: string;
  disputed_amount: number;
  status: string;
  priority: string;
  created_at: string;
  resolution?: string;
  refund_amount?: number;
}

const Disputes: React.FC = () => {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    open: 0,
    underReview: 0,
    resolved: 0,
  });
  const [selectedDispute, setSelectedDispute] = useState<Dispute | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [resolution, setResolution] = useState('');
  const [refundAmount, setRefundAmount] = useState('');

  useEffect(() => {
    loadDisputes();
  }, []);

  const loadDisputes = async () => {
    try {
      const response = await apiService.get('/api/disputes');
      const disputeData = response.data?.disputes || [];
      setDisputes(disputeData);
      
      // Calcular estatísticas
      setStats({
        total: disputeData.length,
        open: disputeData.filter((d: Dispute) => d.status === 'open').length,
        underReview: disputeData.filter((d: Dispute) => d.status === 'under_review').length,
        resolved: disputeData.filter((d: Dispute) => d.status === 'resolved').length,
      });
      
      setLoading(false);
    } catch (error) {
      console.error('Erro ao carregar disputas:', error);
      setLoading(false);
    }
  };

  const handleResolve = async () => {
    if (!selectedDispute || !resolution) return;

    try {
      await apiService.put(`/api/disputes/${selectedDispute.id}/resolve`, {
        resolution,
        refundAmount: refundAmount ? parseFloat(refundAmount) : undefined,
      });

      setDialogOpen(false);
      loadDisputes();
    } catch (error) {
      console.error('Erro ao resolver disputa:', error);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: { [key: string]: 'success' | 'warning' | 'error' | 'default' | 'info' } = {
      open: 'warning',
      under_review: 'info',
      resolved: 'success',
      rejected: 'error',
      cancelled: 'default',
    };
    return colors[status] || 'default';
  };

  const getPriorityColor = (priority: string) => {
    const colors: { [key: string]: 'error' | 'warning' | 'default' } = {
      urgent: 'error',
      high: 'warning',
      medium: 'default',
      low: 'default',
    };
    return colors[priority] || 'default';
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
      <Box display="flex" alignItems="center" mb={3}>
        <Warning sx={{ fontSize: 40, mr: 2, color: '#E53E3E' }} />
        <Typography variant="h4" component="h1">
          Disputas e Estornos
        </Typography>
      </Box>

      {/* Estatísticas */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={1}>
                <Warning sx={{ color: '#E53E3E', mr: 1 }} />
                <Typography color="textSecondary">Total</Typography>
              </Box>
              <Typography variant="h4">{stats.total}</Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={1}>
                <HourglassEmpty sx={{ color: '#ED8936', mr: 1 }} />
                <Typography color="textSecondary">Abertas</Typography>
              </Box>
              <Typography variant="h4" color="#ED8936">{stats.open}</Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={1}>
                <HourglassEmpty sx={{ color: '#2B6CB0', mr: 1 }} />
                <Typography color="textSecondary">Em Revisão</Typography>
              </Box>
              <Typography variant="h4" color="#2B6CB0">{stats.underReview}</Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={1}>
                <CheckCircle sx={{ color: '#48BB78', mr: 1 }} />
                <Typography color="textSecondary">Resolvidas</Typography>
              </Box>
              <Typography variant="h4" color="#48BB78">{stats.resolved}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Lista de Disputas */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Disputas Abertas
          </Typography>
          
          {disputes.length === 0 ? (
            <Alert severity="info">
              Nenhuma disputa encontrada.
            </Alert>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>ID</TableCell>
                    <TableCell>Pagamento</TableCell>
                    <TableCell>Tipo</TableCell>
                    <TableCell>Motivo</TableCell>
                    <TableCell>Valor</TableCell>
                    <TableCell>Prioridade</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Data</TableCell>
                    <TableCell>Ações</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {disputes.map((dispute) => (
                    <TableRow key={dispute.id}>
                      <TableCell>{dispute.id}</TableCell>
                      <TableCell>#{dispute.payment_id}</TableCell>
                      <TableCell>{dispute.type}</TableCell>
                      <TableCell>
                        <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                          {dispute.reason}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography color="#E53E3E" fontWeight="bold">
                          R$ {parseFloat(dispute.disputed_amount.toString()).toFixed(2)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={dispute.priority}
                          color={getPriorityColor(dispute.priority)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={dispute.status}
                          color={getStatusColor(dispute.status)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        {new Date(dispute.created_at).toLocaleDateString('pt-BR')}
                      </TableCell>
                      <TableCell>
                        {dispute.status === 'open' || dispute.status === 'under_review' ? (
                          <Button
                            variant="contained"
                            color="primary"
                            size="small"
                            onClick={() => {
                              setSelectedDispute(dispute);
                              setDialogOpen(true);
                            }}
                          >
                            Resolver
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      {/* Dialog de Resolução */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Resolver Disputa #{selectedDispute?.id}</DialogTitle>
        <DialogContent>
          <FormControl fullWidth margin="normal">
            <InputLabel>Resolução</InputLabel>
            <Select
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              label="Resolução"
            >
              <MenuItem value="refund_full">Reembolso Total</MenuItem>
              <MenuItem value="refund_partial">Reembolso Parcial</MenuItem>
              <MenuItem value="no_action">Rejeitar Disputa</MenuItem>
              <MenuItem value="service_redelivery">Aprovar Reentrega</MenuItem>
            </Select>
          </FormControl>

          {resolution === 'refund_partial' && (
            <TextField
              fullWidth
              margin="normal"
              label="Valor do Reembolso"
              type="number"
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
              helperText="Digite o valor parcial a ser reembolsado"
            />
          )}

          {selectedDispute && (
            <Alert severity="info" sx={{ mt: 2 }}>
              <Typography variant="body2">
                <strong>Tipo:</strong> {selectedDispute.type}
              </Typography>
              <Typography variant="body2">
                <strong>Motivo:</strong> {selectedDispute.reason}
              </Typography>
              <Typography variant="body2">
                <strong>Valor Disputado:</strong> R$ {parseFloat(selectedDispute.disputed_amount.toString()).toFixed(2)}
              </Typography>
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button
            onClick={handleResolve}
            variant="contained"
            color="primary"
            disabled={!resolution}
          >
            Confirmar Resolução
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Disputes;

