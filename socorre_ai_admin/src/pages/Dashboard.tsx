import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  CircularProgress,
  Alert,
  Grid,
  Avatar,
  Chip,
  IconButton,
  Tooltip,
  LinearProgress,
  Divider,
  Tabs,
  Tab,
  Badge,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
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
} from '@mui/material';
import {
  People,
  Business,
  AttachMoney,
  TrendingUp,
  Warning,
  Speed,
  CheckCircle,
  Schedule,
  LocationOn,
  Phone,
  Email,
  Dashboard as DashboardIcon,
  LocalHospital,
  LocalShipping,
  ShoppingCart,
  DirectionsCar,
  Notifications,
  Settings,
  Star,
  WarningAmber,
  Inventory,
  CardMembership,
  LocalGasStation,
  Build,
  TwoWheeler,
  Store,
  Construction,
  Assessment,
  Refresh,
  FilterList,
  Search,
  MoreVert,
  Edit,
  Delete,
  Visibility,
  Add,
} from '@mui/icons-material';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from 'recharts';
import apiService from '../services/api';
import { DashboardStats, Partner, EmergencyRequest, DeliveryOrder, Subscription, Product } from '../types';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`dashboard-tabpanel-${index}`}
      aria-labelledby={`dashboard-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tabValue, setTabValue] = useState(0);
  const [recentPartners, setRecentPartners] = useState<Partner[]>([]);
  const [recentEmergencies, setRecentEmergencies] = useState<EmergencyRequest[]>([]);
  const [recentDeliveries, setRecentDeliveries] = useState<DeliveryOrder[]>([]);
  const [recentSubscriptions, setRecentSubscriptions] = useState<Subscription[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<Product[]>([]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError('');
      
      // Carregar estatísticas principais
      const statsResponse = await apiService.getDashboardStats();
      if (statsResponse.success && statsResponse.data) {
        setStats(statsResponse.data);
      }

      // Carregar dados recentes
      const [partnersResponse, emergenciesResponse, deliveriesResponse, subscriptionsResponse, productsResponse] = await Promise.all([
        apiService.getPartners({ limit: 5, sort: 'created_at', order: 'desc' }),
        apiService.getEmergencyRequests({ limit: 5, sort: 'created_at', order: 'desc' }),
        apiService.getDeliveryOrders({ limit: 5, sort: 'created_at', order: 'desc' }),
        apiService.getSubscriptions({ limit: 5, sort: 'created_at', order: 'desc' }),
        apiService.getProducts({ limit: 5, sort: 'stock', order: 'asc', low_stock: true }),
      ]);

      if (partnersResponse.success) {
        setRecentPartners(partnersResponse.data?.partners || []);
      }
      if (emergenciesResponse.success) {
        // Same Phase 2 constraint as EmergencyRequests: never surface the
        // deprecated legacy Tow rows (`adminListTowRequests` is unrouted).
        setRecentEmergencies(
          (emergenciesResponse.data?.requests || []).filter(
            (request: EmergencyRequest) => request.request_type !== 'tow'
          )
        );
      }
      if (deliveriesResponse.success) {
        setRecentDeliveries(deliveriesResponse.data?.orders || []);
      }
      if (subscriptionsResponse.success) {
        setRecentSubscriptions(subscriptionsResponse.data?.subscriptions || []);
      }
      if (productsResponse.success) {
        setLowStockProducts(productsResponse.data?.products || []);
      }

    } catch (err: any) {
      console.error('Erro ao carregar dashboard:', err);
      if (err.response?.status === 401) {
        setError('Sessão expirada. Redirecionando...');
      } else {
        setError(err.response?.data?.message || 'Erro de conexão com o servidor');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  // Dados para gráficos
  const monthlyRevenueData = [
    { name: 'Jan', emergency: 12500, delivery: 8900, subscription: 15600, total: 37000 },
    { name: 'Fev', emergency: 15800, delivery: 10200, subscription: 16800, total: 42800 },
    { name: 'Mar', emergency: 18900, delivery: 12100, subscription: 18200, total: 49200 },
    { name: 'Abr', emergency: 22100, delivery: 14500, subscription: 19400, total: 56000 },
    { name: 'Mai', emergency: 28400, delivery: 16800, subscription: 21000, total: 66200 },
    { name: 'Jun', emergency: 31200, delivery: 19200, subscription: 22800, total: 73200 },
  ];

  const partnerTypeData = [
    { name: 'Mecânicos', value: stats?.totalMechanics || 0, color: '#E30613' },
    { name: 'Motoboys', value: stats?.totalMotoboys || 0, color: '#002F6C' },
    { name: 'Postos de Combustível', value: stats?.totalGasStations || 0, color: '#FF9800' },
    { name: 'Auto Peças', value: stats?.totalAutoParts || 0, color: '#4CAF50' },
  ];

  const serviceStatusData = [
    { name: 'Pendentes', value: stats?.pendingEmergencyRequests || 0, color: '#FF9800' },
    { name: 'Em Andamento', value: stats?.inProgressEmergencyRequests || 0, color: '#2196F3' },
    { name: 'Concluídos', value: stats?.completedEmergencyRequests || 0, color: '#4CAF50' },
    { name: 'Cancelados', value: 0, color: '#F44336' },
  ];

  const subscriptionStatusData = [
    { name: 'Ativas', value: stats?.activeSubscriptions || 0, color: '#4CAF50' },
    { name: 'Expiradas', value: stats?.expiredSubscriptions || 0, color: '#F44336' },
    { name: 'Canceladas', value: stats?.cancelledSubscriptions || 0, color: '#9E9E9E' },
    { name: 'Pendente Pagto', value: stats?.pendingPaymentSubscriptions || 0, color: '#FF9800' },
  ];

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <CircularProgress size={60} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={3}>
        <Alert severity="error" action={
          <Button color="inherit" size="small" onClick={loadDashboardData}>
            Tentar novamente
          </Button>
        }>
          {error}
        </Alert>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" component="h1" fontWeight="bold">
          Dashboard Administrativo
        </Typography>
        <Button
          variant="outlined"
          startIcon={<Refresh />}
          onClick={loadDashboardData}
        >
          Atualizar
        </Button>
      </Box>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={tabValue} onChange={handleTabChange}>
          <Tab label="Visão Geral" />
          <Tab label="Parceiros" />
          <Tab label="Serviços" />
          <Tab label="Financeiro" />
          <Tab label="Operações" />
        </Tabs>
      </Box>

      {/* Tab Panels */}
      <TabPanel value={tabValue} index={0}>
        <OverviewTab 
          stats={stats} 
          monthlyRevenueData={monthlyRevenueData}
          partnerTypeData={partnerTypeData}
          serviceStatusData={serviceStatusData}
        />
      </TabPanel>

      <TabPanel value={tabValue} index={1}>
        <PartnersTab 
          stats={stats}
          recentPartners={recentPartners}
          partnerTypeData={partnerTypeData}
        />
      </TabPanel>

      <TabPanel value={tabValue} index={2}>
        <ServicesTab 
          stats={stats}
          recentEmergencies={recentEmergencies}
          recentDeliveries={recentDeliveries}
          serviceStatusData={serviceStatusData}
        />
      </TabPanel>

      <TabPanel value={tabValue} index={3}>
        <FinancialTab 
          stats={stats}
          monthlyRevenueData={monthlyRevenueData}
          subscriptionStatusData={subscriptionStatusData}
          recentSubscriptions={recentSubscriptions}
        />
      </TabPanel>

      <TabPanel value={tabValue} index={4}>
        <OperationsTab 
          stats={stats}
          lowStockProducts={lowStockProducts}
          recentSubscriptions={recentSubscriptions}
        />
      </TabPanel>
    </Box>
  );
};

// Componentes das Tabs
const OverviewTab: React.FC<{
  stats: DashboardStats | null;
  monthlyRevenueData: any[];
  partnerTypeData: any[];
  serviceStatusData: any[];
}> = ({ stats, monthlyRevenueData, partnerTypeData, serviceStatusData }) => {
  return (
    <Grid container spacing={3}>
      {/* Cards principais */}
      <Grid item xs={12} sm={6} md={3}>
        <StatsCard
          title="Usuários Totais"
          value={stats?.totalUsers || 0}
          icon={<People />}
          color="#2196F3"
          subtitle={`Ativos: ${stats?.activeUsers || 0}`}
        />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <StatsCard
          title="Parceiros"
          value={stats?.totalPartnersNew || 0}
          icon={<Business />}
          color="#4CAF50"
          subtitle={`Verificados: ${stats?.verifiedPartners || 0}`}
        />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <StatsCard
          title="Receita Total"
          value={`R$ ${(stats?.totalRevenue || 0).toLocaleString('pt-BR')}`}
          icon={<AttachMoney />}
          color="#FF9800"
          subtitle="Este mês"
        />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <StatsCard
          title="Taxa de Sucesso"
          value={`${(stats?.emergencyCompletionRate || 0).toFixed(1)}%`}
          icon={<TrendingUp />}
          color="#9C27B0"
          subtitle="Emergências"
        />
      </Grid>

      {/* Gráficos */}
      <Grid item xs={12} md={8}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Receita Mensal
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={monthlyRevenueData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <RechartsTooltip />
                <Area type="monotone" dataKey="emergency" stackId="1" stroke="#E30613" fill="#E30613" />
                <Area type="monotone" dataKey="delivery" stackId="1" stroke="#002F6C" fill="#002F6C" />
                <Area type="monotone" dataKey="subscription" stackId="1" stroke="#4CAF50" fill="#4CAF50" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </Grid>

      <Grid item xs={12} md={4}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Tipos de Parceiros
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={partnerTypeData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {partnerTypeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </Grid>

      {/* Status dos Serviços */}
      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Status das Emergências
            </Typography>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={serviceStatusData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <RechartsTooltip />
                <Bar dataKey="value" fill="#8884d8">
                  {serviceStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </Grid>

      {/* Métricas Rápidas */}
      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Métricas Rápidas
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <Box textAlign="center">
                  <Typography variant="h4" color="primary">
                    {stats?.totalEmergencyRequests || 0}
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    Emergências
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={6}>
                <Box textAlign="center">
                  <Typography variant="h4" color="secondary">
                    {stats?.totalDeliveryOrders || 0}
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    Deliveries
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={6}>
                <Box textAlign="center">
                  <Typography variant="h4" color="success.main">
                    {stats?.activeSubscriptions || 0}
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    Assinaturas Ativas
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={6}>
                <Box textAlign="center">
                  <Typography variant="h4" color="warning.main">
                    {stats?.totalProducts || 0}
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    Produtos
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
};

const PartnersTab: React.FC<{
  stats: DashboardStats | null;
  recentPartners: Partner[];
  partnerTypeData: any[];
}> = ({ stats, recentPartners, partnerTypeData }) => {
  return (
    <Grid container spacing={3}>
      {/* Cards de Parceiros */}
      <Grid item xs={12} sm={6} md={2}>
        <StatsCard
          title="Mecânicos"
          value={stats?.totalMechanics || 0}
          icon={<Build />}
          color="#E30613"
          subtitle="Verificados"
        />
      </Grid>
      <Grid item xs={12} sm={6} md={2}>
        <StatsCard
          title="Motoboys"
          value={stats?.totalMotoboys || 0}
          icon={<TwoWheeler />}
          color="#002F6C"
          subtitle="Online"
        />
      </Grid>
      <Grid item xs={12} sm={6} md={2}>
        <StatsCard
          title="Postos"
          value={stats?.totalGasStations || 0}
          icon={<LocalGasStation />}
          color="#FF9800"
          subtitle="Ativos"
        />
      </Grid>
      <Grid item xs={12} sm={6} md={2}>
        <StatsCard
          title="Auto Peças"
          value={stats?.totalAutoParts || 0}
          icon={<Store />}
          color="#4CAF50"
          subtitle="Com Delivery"
        />
      </Grid>

      {/* Gráfico de Tipos */}
      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Distribuição de Parceiros
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={partnerTypeData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {partnerTypeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </Grid>

      {/* Parceiros Recentes */}
      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Parceiros Recentes
            </Typography>
            <List>
              {recentPartners.map((partner) => (
                <ListItem key={partner.id} divider>
                  <ListItemIcon>
                    <Avatar>
                      {partner.type === 'mechanic' && <Build />}
                      {partner.type === 'motoboy' && <TwoWheeler />}
                      {partner.type === 'gas_station' && <LocalGasStation />}
                      {partner.type === 'auto_parts' && <Store />}
                      {partner.type === 'tow' && <LocalShipping />}
                    </Avatar>
                  </ListItemIcon>
                  <ListItemText
                    primary={partner.business_name}
                    secondary={`${partner.type} • ${partner.is_verified ? 'Verificado' : 'Pendente'}`}
                  />
                  <Chip
                    label={partner.is_online ? 'Online' : 'Offline'}
                    color={partner.is_online ? 'success' : 'default'}
                    size="small"
                  />
                </ListItem>
              ))}
            </List>
          </CardContent>
        </Card>
      </Grid>

      {/* Métricas de Parceiros */}
      <Grid item xs={12}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Métricas de Parceiros
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} sm={3}>
                <Box textAlign="center">
                  <Typography variant="h4" color="primary">
                    {(stats?.partnerVerificationRate || 0).toFixed(1)}%
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    Taxa de Verificação
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={3}>
                <Box textAlign="center">
                  <Typography variant="h4" color="secondary">
                    {(stats?.partnerOnlineRate || 0).toFixed(1)}%
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    Taxa de Online
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={3}>
                <Box textAlign="center">
                  <Typography variant="h4" color="success.main">
                    {stats?.averagePartnerRating || '0.0'}
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    Avaliação Média
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={3}>
                <Box textAlign="center">
                  <Typography variant="h4" color="warning.main">
                    {stats?.availablePartners || 0}
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    Disponíveis
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
};

const ServicesTab: React.FC<{
  stats: DashboardStats | null;
  recentEmergencies: EmergencyRequest[];
  recentDeliveries: DeliveryOrder[];
  serviceStatusData: any[];
}> = ({ stats, recentEmergencies, recentDeliveries, serviceStatusData }) => {
  return (
    <Grid container spacing={3}>
      {/* Cards de Serviços */}
      <Grid item xs={12} sm={6} md={3}>
        <StatsCard
          title="Emergências"
          value={stats?.totalEmergencyRequests || 0}
          icon={<LocalHospital />}
          color="#E30613"
          subtitle={`Pendentes: ${stats?.pendingEmergencyRequests || 0}`}
        />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <StatsCard
          title="Deliveries"
          value={stats?.totalDeliveryOrders || 0}
          icon={<LocalShipping />}
          color="#FF9800"
          subtitle={`Concluídos: ${stats?.deliveredDeliveryOrders || 0}`}
        />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <StatsCard
          title="Taxa de Sucesso"
          value={`${(stats?.deliverySuccessRate || 0).toFixed(1)}%`}
          icon={<TrendingUp />}
          color="#4CAF50"
          subtitle="Deliveries"
        />
      </Grid>

      {/* Status dos Serviços */}
      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Status das Emergências
            </Typography>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={serviceStatusData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <RechartsTooltip />
                <Bar dataKey="value" fill="#8884d8">
                  {serviceStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </Grid>

      {/* Emergências Recentes */}
      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Emergências Recentes
            </Typography>
            <List>
              {recentEmergencies.map((emergency) => (
                <ListItem key={emergency.id} divider>
                  <ListItemIcon>
                    <Avatar>
                      <LocalHospital />
                    </Avatar>
                  </ListItemIcon>
                  <ListItemText
                    primary={emergency.description}
                    secondary={`${emergency.type} • ${emergency.status}`}
                  />
                  <Chip
                    label={emergency.urgency}
                    color={
                      emergency.urgency === 'critical' ? 'error' :
                      emergency.urgency === 'high' ? 'warning' :
                      emergency.urgency === 'medium' ? 'info' : 'default'
                    }
                    size="small"
                  />
                </ListItem>
              ))}
            </List>
          </CardContent>
        </Card>
      </Grid>

      {/* Deliveries Recentes */}
      <Grid item xs={12}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Deliveries Recentes
            </Typography>
            <List>
              {recentDeliveries.map((delivery) => (
                <ListItem key={delivery.id} divider>
                  <ListItemIcon>
                    <Avatar>
                      <LocalShipping />
                    </Avatar>
                  </ListItemIcon>
                  <ListItemText
                    primary={`${delivery.order_type} • ${delivery.items_count} itens`}
                    secondary={`R$ ${delivery.total_amount.toFixed(2)} • ${delivery.status}`}
                  />
                  <Chip
                    label={delivery.status}
                    color={
                      delivery.status === 'delivered' ? 'success' :
                      delivery.status === 'in_transit' ? 'warning' :
                      delivery.status === 'cancelled' ? 'error' : 'default'
                    }
                    size="small"
                  />
                </ListItem>
              ))}
            </List>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
};

const FinancialTab: React.FC<{
  stats: DashboardStats | null;
  monthlyRevenueData: any[];
  subscriptionStatusData: any[];
  recentSubscriptions: Subscription[];
}> = ({ stats, monthlyRevenueData, subscriptionStatusData, recentSubscriptions }) => {
  return (
    <Grid container spacing={3}>
      {/* Cards Financeiros */}
      <Grid item xs={12} sm={6} md={3}>
        <StatsCard
          title="Receita Total"
          value={`R$ ${(stats?.totalRevenue || 0).toLocaleString('pt-BR')}`}
          icon={<AttachMoney />}
          color="#4CAF50"
          subtitle="Este mês"
        />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <StatsCard
          title="Assinaturas"
          value={`R$ ${(stats?.subscriptionRevenue || 0).toLocaleString('pt-BR')}`}
          icon={<CardMembership />}
          color="#9C27B0"
          subtitle="Mensais"
        />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <StatsCard
          title="Emergências"
          value={`R$ ${(stats?.emergencyRevenue || 0).toLocaleString('pt-BR')}`}
          icon={<LocalHospital />}
          color="#E30613"
          subtitle="Serviços"
        />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <StatsCard
          title="Deliveries"
          value={`R$ ${(stats?.deliveryRevenue || 0).toLocaleString('pt-BR')}`}
          icon={<LocalShipping />}
          color="#FF9800"
          subtitle="Entregas"
        />
      </Grid>

      {/* Gráfico de Receita */}
      <Grid item xs={12} md={8}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Evolução da Receita
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={monthlyRevenueData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <RechartsTooltip />
                <Line type="monotone" dataKey="emergency" stroke="#E30613" strokeWidth={2} />
                <Line type="monotone" dataKey="delivery" stroke="#FF9800" strokeWidth={2} />
                <Line type="monotone" dataKey="subscription" stroke="#9C27B0" strokeWidth={2} />
                <Line type="monotone" dataKey="total" stroke="#4CAF50" strokeWidth={3} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </Grid>

      {/* Status das Assinaturas */}
      <Grid item xs={12} md={4}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Status das Assinaturas
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={subscriptionStatusData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {subscriptionStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </Grid>

      {/* Assinaturas Recentes */}
      <Grid item xs={12}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Assinaturas Recentes
            </Typography>
            <List>
              {recentSubscriptions.map((subscription) => (
                <ListItem key={subscription.id} divider>
                  <ListItemIcon>
                    <Avatar>
                      <CardMembership />
                    </Avatar>
                  </ListItemIcon>
                  <ListItemText
                    primary={subscription.partner_name}
                    secondary={`${subscription.type} • R$ ${subscription.monthly_fee.toFixed(2)}/mês`}
                  />
                  <Chip
                    label={subscription.status}
                    color={
                      subscription.status === 'active' ? 'success' :
                      subscription.status === 'expired' ? 'error' :
                      subscription.status === 'pending_payment' ? 'warning' : 'default'
                    }
                    size="small"
                  />
                </ListItem>
              ))}
            </List>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
};

const OperationsTab: React.FC<{
  stats: DashboardStats | null;
  lowStockProducts: Product[];
  recentSubscriptions: Subscription[];
}> = ({ stats, lowStockProducts, recentSubscriptions }) => {
  return (
    <Grid container spacing={3}>
      {/* Cards de Operações */}
      <Grid item xs={12} sm={6} md={3}>
        <StatsCard
          title="Produtos"
          value={stats?.totalProducts || 0}
          icon={<Inventory />}
          color="#2196F3"
          subtitle={`Ativos: ${stats?.activeProducts || 0}`}
        />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <StatsCard
          title="Baixo Estoque"
          value={stats?.lowStockProducts || 0}
          icon={<WarningAmber />}
          color="#FF9800"
          subtitle="Atenção"
        />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <StatsCard
          title="Assinaturas"
          value={stats?.activeSubscriptions || 0}
          icon={<CardMembership />}
          color="#4CAF50"
          subtitle="Ativas"
        />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <StatsCard
          title="Expirando em Breve"
          value={stats?.expiringSoonSubscriptions || 0}
          icon={<Schedule />}
          color="#E30613"
          subtitle="Próximos 7 dias"
        />
      </Grid>

      {/* Produtos com Baixo Estoque */}
      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Produtos com Baixo Estoque
            </Typography>
            <List>
              {lowStockProducts.map((product) => (
                <ListItem key={product.id} divider>
                  <ListItemIcon>
                    <Avatar>
                      <Inventory />
                    </Avatar>
                  </ListItemIcon>
                  <ListItemText
                    primary={product.name}
                    secondary={`${product.category} • Estoque: ${product.stock}`}
                  />
                  <Chip
                    label={product.stock === 0 ? 'Sem Estoque' : 'Baixo Estoque'}
                    color={product.stock === 0 ? 'error' : 'warning'}
                    size="small"
                  />
                </ListItem>
              ))}
            </List>
          </CardContent>
        </Card>
      </Grid>

      {/* Assinaturas Expirando */}
      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Assinaturas Expirando em Breve
            </Typography>
            <List>
              {recentSubscriptions
                .filter(sub => sub.status === 'active' || sub.status === 'pending_payment')
                .map((subscription) => (
                <ListItem key={subscription.id} divider>
                  <ListItemIcon>
                    <Avatar>
                      <CardMembership />
                    </Avatar>
                  </ListItemIcon>
                  <ListItemText
                    primary={subscription.partner_name}
                    secondary={`Vence: ${new Date(subscription.end_date).toLocaleDateString('pt-BR')}`}
                  />
                  <Chip
                    label={subscription.status === 'pending_payment' ? 'Pendente Pagto' : 'Ativa'}
                    color={subscription.status === 'pending_payment' ? 'warning' : 'success'}
                    size="small"
                  />
                </ListItem>
              ))}
            </List>
          </CardContent>
        </Card>
      </Grid>

      {/* Métricas Operacionais */}
      <Grid item xs={12}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Métricas Operacionais
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} sm={3}>
                <Box textAlign="center">
                  <Typography variant="h4" color="primary">
                    {(stats?.averageProposalValue || 0).toFixed(2)}
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    Valor Médio Proposta
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={3}>
                <Box textAlign="center">
                  <Typography variant="h4" color="secondary">
                    {(stats?.averageDeliveryValue || 0).toFixed(2)}
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    Valor Médio Delivery
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={3}>
                <Box textAlign="center">
                  <Typography variant="h4" color="success.main">
                    {(stats?.averageSubscriptionValue || 0).toFixed(2)}
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    Valor Médio Assinatura
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={3}>
                <Box textAlign="center">
                  <Typography variant="h4" color="warning.main">
                    {(stats?.systemHealthScore || 0).toFixed(1)}%
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    Saúde do Sistema
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
};

// Componente StatsCard
const StatsCard: React.FC<{
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  subtitle?: string;
}> = ({ title, value, icon, color, subtitle }) => {
  return (
    <Card>
      <CardContent>
        <Box display="flex" alignItems="center">
          <Box
            sx={{
              backgroundColor: color,
              color: 'white',
              borderRadius: 1,
              p: 1,
              mr: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {icon}
          </Box>
          <Box>
            <Typography variant="h6" color="textSecondary">
              {title}
            </Typography>
            <Typography variant="h4" fontWeight="bold">
              {value}
            </Typography>
            {subtitle && (
              <Typography variant="body2" color="textSecondary">
                {subtitle}
              </Typography>
            )}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

export default Dashboard;
