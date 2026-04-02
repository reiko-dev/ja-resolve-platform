import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  Chip,
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
  Switch,
  FormControlLabel,
  Avatar,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  DataGrid,
  GridColDef,
  GridValueGetterParams,
  GridActionsCellItem,
} from '@mui/x-data-grid';
import {
  Edit,
  Delete,
  Visibility,
  CheckCircle,
  Cancel,
  Add,
  Person,
} from '@mui/icons-material';
import apiService from '../services/api';
import { User } from '../types';

const Users: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    role: 'user' as 'user' | 'partner' | 'admin',
    is_active: true,
  });

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await apiService.getUsers(1, 100); // Carregar todos os usuários
      if (response.success && response.data) {
        setUsers(response.data.users || response.data.items || []);
      } else {
        setError(response.message || 'Erro ao carregar usuários');
      }
    } catch (err: any) {
      console.error('Erro ao carregar usuários:', err);
      setError(err.response?.data?.message || 'Erro de conexão');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
        password: '',
        role: user.role || 'user',
        is_active: user.is_active !== undefined ? user.is_active : true,
      });
    } else {
      setEditingUser(null);
      setFormData({
        name: '',
        email: '',
        phone: '',
        password: '',
        role: 'user',
        is_active: true,
      });
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingUser(null);
  };

  const handleSubmit = async () => {
    try {
      if (editingUser) {
        // Para edição, não enviar senha se estiver vazia
        const { password, ...updateData } = formData;
        
        const response = await apiService.updateUser(editingUser.id, updateData);
        if (response.success) {
          loadUsers();
          handleCloseDialog();
        } else {
          setError(response.message || 'Erro ao atualizar usuário');
        }
      } else {
        // Criar novo usuário
        if (!formData.password) {
          setError('Senha é obrigatória para criar usuário');
          return;
        }
        
        const response = await apiService.createUser({
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          role: formData.role,
          password: formData.password
        });
        
        if (response.success) {
          loadUsers();
          handleCloseDialog();
        } else {
          setError(response.message || 'Erro ao criar usuário');
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erro de conexão');
    }
  };

  const handleDelete = async (id: number) => {
    if (window.confirm('Tem certeza que deseja excluir este usuário?')) {
      try {
        const response = await apiService.deleteUser(id);
        if (response.success) {
          loadUsers();
        } else {
          setError(response.message || 'Erro ao excluir usuário');
        }
      } catch (err: any) {
        setError(err.response?.data?.message || 'Erro de conexão');
      }
    }
  };

  const handleView = (user: User) => {
    setEditingUser(user);
          setFormData({
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
        password: '',
        role: user.role || 'user',
        is_active: user.is_active !== undefined ? user.is_active : true,
      });
    setOpenDialog(true);
  };

  const columns: GridColDef[] = [
    {
      field: 'id',
      headerName: 'ID',
      width: 70,
    },
    {
      field: 'name',
      headerName: 'Nome',
      width: 200,
      renderCell: (params) => (
        <Box display="flex" alignItems="center">
          <Avatar sx={{ width: 32, height: 32, mr: 1, bgcolor: '#002F6C' }}>
            <Person />
          </Avatar>
          <Typography variant="body2">{params.value}</Typography>
        </Box>
      ),
    },
    {
      field: 'email',
      headerName: 'Email',
      width: 250,
    },
    {
      field: 'phone',
      headerName: 'Telefone',
      width: 150,
    },
    {
      field: 'role',
      headerName: 'Tipo',
      width: 120,
      renderCell: (params) => (
        <Chip
          label={params.value === 'admin' ? 'Admin' : params.value === 'partner' ? 'Parceiro' : 'Usuário'}
          color={params.value === 'admin' ? 'error' : params.value === 'partner' ? 'warning' : 'primary'}
          size="small"
        />
      ),
    },
    {
      field: 'is_active',
      headerName: 'Status',
      width: 100,
      renderCell: (params) => (
        <Chip
          icon={params.value ? <CheckCircle /> : <Cancel />}
          label={params.value ? 'Ativo' : 'Inativo'}
          color={params.value ? 'success' : 'default'}
          size="small"
        />
      ),
    },
    {
      field: 'email_verified',
      headerName: 'Email Verificado',
      width: 130,
      renderCell: (params) => (
        <Chip
          icon={params.value ? <CheckCircle /> : <Cancel />}
          label={params.value ? 'Verificado' : 'Não verificado'}
          color={params.value ? 'success' : 'default'}
          size="small"
        />
      ),
    },
    {
      field: 'created_at',
      headerName: 'Data de Criação',
      width: 150,
      valueGetter: (params: GridValueGetterParams) => {
        return params.value ? new Date(params.value).toLocaleDateString('pt-BR') : '';
      },
    },
    {
      field: 'actions',
      type: 'actions',
      headerName: 'Ações',
      width: 150,
      getActions: (params) => [
        <GridActionsCellItem
          icon={<Visibility />}
          label="Visualizar"
          onClick={() => handleView(params.row)}
        />,
        <GridActionsCellItem
          icon={<Edit />}
          label="Editar"
          onClick={() => handleOpenDialog(params.row)}
        />,
        <GridActionsCellItem
          icon={<Delete />}
          label="Excluir"
          onClick={() => handleDelete(params.id as number)}
        />,
      ],
    },
  ];

  if (loading && users.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress size={60} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" fontWeight="bold" color="#002F6C">
            Gerenciar Usuários
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Gerencie todos os usuários do sistema
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => handleOpenDialog()}
          sx={{
            background: 'linear-gradient(135deg, #002F6C 0%, #1a4a8a 100%)',
            '&:hover': {
              background: 'linear-gradient(135deg, #1a4a8a 0%, #002F6C 100%)',
            }
          }}
        >
          Novo Usuário
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Card>
        <CardContent>
          <DataGrid
            rows={users}
            columns={columns}
            pageSizeOptions={[10, 25, 50]}
            loading={loading}
            autoHeight
            disableRowSelectionOnClick
            sx={{
              '& .MuiDataGrid-cell:focus': {
                outline: 'none',
              },
              '& .MuiDataGrid-row:hover': {
                backgroundColor: '#f8f9fa',
              },
            }}
          />
        </CardContent>
      </Card>

      {/* Dialog para visualizar/editar usuário */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingUser ? 'Detalhes do Usuário' : 'Novo Usuário'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <TextField
              fullWidth
              label="Nome"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              margin="normal"
              required
              disabled={!!editingUser && editingUser.id === 5} // Não permitir editar o admin principal
            />
            <TextField
              fullWidth
              label="Email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              margin="normal"
              required
              disabled={!!editingUser && editingUser.id === 5} // Não permitir editar o admin principal
            />
            <TextField
              fullWidth
              label="Telefone"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              margin="normal"
            />
            {!editingUser && (
              <TextField
                fullWidth
                label="Senha"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                margin="normal"
                required
                helperText="Senha obrigatória para novos usuários"
              />
            )}
            <FormControl fullWidth margin="normal">
              <InputLabel>Tipo de Usuário</InputLabel>
              <Select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value as 'user' | 'partner' | 'admin' })}
                label="Tipo de Usuário"
                disabled={!!editingUser && editingUser.id === 5} // Não permitir editar o admin principal
              >
                <MenuItem value="user">Usuário</MenuItem>
                <MenuItem value="partner">Parceiro</MenuItem>
                <MenuItem value="admin">Administrador</MenuItem>
              </Select>
            </FormControl>
            <FormControlLabel
              control={
                <Switch
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  disabled={!!editingUser && editingUser.id === 5} // Não permitir editar o admin principal
                />
              }
              label="Usuário Ativo"
              sx={{ mt: 2 }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancelar</Button>
          {editingUser ? (
            <Button onClick={handleSubmit} variant="contained" color="primary">
              Salvar Alterações
            </Button>
          ) : (
            <Button onClick={handleSubmit} variant="contained" color="success">
              Criar Usuário
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Users;
