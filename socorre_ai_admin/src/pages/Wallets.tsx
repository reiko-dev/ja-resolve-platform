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
} from '@mui/material';
import {
  AccountBalanceWallet,
  TrendingUp,
  TrendingDown,
  AttachMoney,
} from '@mui/icons-material';
import apiService from '../services/api';

interface Wallet {
  id: number;
  user_id: number;
  available_balance: number;
  pending_balance: number;
  total_earned: number;
  total_withdrawn: number;
  is_active: boolean;
  withdrawal_enabled: boolean;
}

interface Transaction {
  id: number;
  type: string;
  direction: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  description: string;
  status: string;
  created_at: string;
}

const Wallets: React.FC = () => {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalWallets: 0,
    totalBalance: 0,
    totalEarned: 0,
    totalWithdrawn: 0,
  });

  useEffect(() => {
    loadWallets();
  }, []);

  const loadWallets = async () => {
    try {
      // Dados mockados por enquanto até implementar endpoint completo
      const mockWallets: Wallet[] = [];
      setWallets(mockWallets);
      
      // Calcular estatísticas
      const calculatedStats = wallets.reduce((acc, wallet) => ({
        totalWallets: acc.totalWallets + 1,
        totalBalance: acc.totalBalance + parseFloat(wallet.available_balance.toString()),
        totalEarned: acc.totalEarned + parseFloat(wallet.total_earned.toString()),
        totalWithdrawn: acc.totalWithdrawn + parseFloat(wallet.total_withdrawn.toString()),
      }), { totalWallets: 0, totalBalance: 0, totalEarned: 0, totalWithdrawn: 0 });
      
      setStats(calculatedStats);
      setLoading(false);
    } catch (error) {
      console.error('Erro ao carregar carteiras:', error);
      setLoading(false);
    }
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
        <AccountBalanceWallet sx={{ fontSize: 40, mr: 2, color: '#2B6CB0' }} />
        <Typography variant="h4" component="h1">
          Carteiras Digitais
        </Typography>
      </Box>

      {/* Estatísticas */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={1}>
                <AccountBalanceWallet sx={{ color: '#2B6CB0', mr: 1 }} />
                <Typography color="textSecondary">Total de Carteiras</Typography>
              </Box>
              <Typography variant="h4">{stats.totalWallets}</Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={1}>
                <TrendingUp sx={{ color: '#48BB78', mr: 1 }} />
                <Typography color="textSecondary">Saldo Total</Typography>
              </Box>
              <Typography variant="h4" color="#48BB78">
                R$ {stats.totalBalance.toFixed(2)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={1}>
                <AttachMoney sx={{ color: '#ED8936', mr: 1 }} />
                <Typography color="textSecondary">Total Arrecadado</Typography>
              </Box>
              <Typography variant="h4" color="#ED8936">
                R$ {stats.totalEarned.toFixed(2)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={1}>
                <TrendingDown sx={{ color: '#E53E3E', mr: 1 }} />
                <Typography color="textSecondary">Total Sacado</Typography>
              </Box>
              <Typography variant="h4" color="#E53E3E">
                R$ {stats.totalWithdrawn.toFixed(2)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Lista de Carteiras */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Carteiras Cadastradas
          </Typography>
          
          {wallets.length === 0 ? (
            <Alert severity="info">
              Nenhuma carteira encontrada. As carteiras são criadas automaticamente quando usuários ou parceiros se registram.
            </Alert>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>ID</TableCell>
                    <TableCell>Usuário</TableCell>
                    <TableCell>Saldo Disponível</TableCell>
                    <TableCell>Saldo Pendente</TableCell>
                    <TableCell>Total Arrecadado</TableCell>
                    <TableCell>Total Sacado</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Saque Habilitado</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {wallets.map((wallet) => (
                    <TableRow key={wallet.id}>
                      <TableCell>{wallet.id}</TableCell>
                      <TableCell>{wallet.user_id}</TableCell>
                      <TableCell>
                        <Typography color="#48BB78" fontWeight="bold">
                          R$ {parseFloat(wallet.available_balance.toString()).toFixed(2)}
                        </Typography>
                      </TableCell>
                      <TableCell>R$ {parseFloat(wallet.pending_balance.toString()).toFixed(2)}</TableCell>
                      <TableCell>R$ {parseFloat(wallet.total_earned.toString()).toFixed(2)}</TableCell>
                      <TableCell>R$ {parseFloat(wallet.total_withdrawn.toString()).toFixed(2)}</TableCell>
                      <TableCell>
                        <Chip
                          label={wallet.is_active ? 'Ativa' : 'Inativa'}
                          color={wallet.is_active ? 'success' : 'default'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={wallet.withdrawal_enabled ? 'Sim' : 'Não'}
                          color={wallet.withdrawal_enabled ? 'success' : 'warning'}
                          size="small"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default Wallets;

