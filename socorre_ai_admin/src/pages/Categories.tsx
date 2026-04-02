import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  Chip,
  IconButton,
  Tooltip,
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
  DataGrid,
  GridColDef,
  GridValueGetterParams,
  GridActionsCellItem,
} from '@mui/x-data-grid';
import {
  Edit,
  Delete,
  Add,
  Visibility,
  CheckCircle,
  Cancel,
} from '@mui/icons-material';
import apiService from '../services/api';
import { Category } from '../types';

const Categories: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    icon: 'category',
    color: '#002F6C',
    sort_order: 0,
    is_active: true,
  });

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await apiService.getCategories();
      if (response.success && response.data) {
        setCategories(response.data);
      } else {
        setError(response.message || 'Erro ao carregar categorias');
      }
    } catch (err: any) {
      console.error('Erro ao carregar categorias:', err);
      setError(err.response?.data?.message || 'Erro de conexão');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (category?: Category) => {
    if (category) {
      setEditingCategory(category);
      setFormData({
        name: category.name,
        description: category.description || '',
        icon: category.icon || 'category',
        color: category.color || '#002F6C',
        sort_order: category.sort_order || 0,
        is_active: category.is_active,
      });
    } else {
      setEditingCategory(null);
      setFormData({
        name: '',
        description: '',
        icon: 'category',
        color: '#002F6C',
        sort_order: 0,
        is_active: true,
      });
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingCategory(null);
  };

  const handleSubmit = async () => {
    try {
      if (editingCategory) {
        const response = await apiService.updateCategory(editingCategory.id, formData);
        if (response.success) {
          loadCategories();
          handleCloseDialog();
        } else {
          setError(response.message || 'Erro ao atualizar categoria');
        }
      } else {
        const response = await apiService.createCategory(formData);
        if (response.success) {
          loadCategories();
          handleCloseDialog();
        } else {
          setError(response.message || 'Erro ao criar categoria');
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erro de conexão');
    }
  };

  const handleDelete = async (id: number) => {
    if (window.confirm('Tem certeza que deseja excluir esta categoria?')) {
      try {
        const response = await apiService.deleteCategory(id);
        if (response.success) {
          loadCategories();
        } else {
          setError(response.message || 'Erro ao excluir categoria');
        }
      } catch (err: any) {
        setError(err.response?.data?.message || 'Erro de conexão');
      }
    }
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
    },
    {
      field: 'description',
      headerName: 'Descrição',
      width: 300,
    },
    {
      field: 'icon',
      headerName: 'Ícone',
      width: 100,
    },
    {
      field: 'color',
      headerName: 'Cor',
      width: 100,
      renderCell: (params) => (
        <Box
          sx={{
            width: 30,
            height: 20,
            backgroundColor: params.value,
            borderRadius: 1,
            border: '1px solid #ddd',
          }}
        />
      ),
    },
    {
      field: 'sort_order',
      headerName: 'Ordem',
      width: 80,
    },
    {
      field: 'is_active',
      headerName: 'Status',
      width: 100,
      renderCell: (params) => (
        <Chip
          icon={params.value ? <CheckCircle /> : <Cancel />}
          label={params.value ? 'Ativa' : 'Inativa'}
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
        return new Date(params.value).toLocaleDateString('pt-BR');
      },
    },
    {
      field: 'actions',
      type: 'actions',
      headerName: 'Ações',
      width: 120,
      getActions: (params) => [
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

  if (loading && categories.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">
          Gerenciar Categorias
        </Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => handleOpenDialog()}
        >
          Nova Categoria
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
            rows={categories}
            columns={columns}
            pageSizeOptions={[10, 25, 50]}
            loading={loading}
            autoHeight
            disableRowSelectionOnClick
            sx={{
              '& .MuiDataGrid-cell:focus': {
                outline: 'none',
              },
            }}
          />
        </CardContent>
      </Card>

      {/* Dialog para criar/editar categoria */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingCategory ? 'Editar Categoria' : 'Nova Categoria'}
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
            />
            <TextField
              fullWidth
              label="Descrição"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              margin="normal"
              multiline
              rows={3}
            />
            <TextField
              fullWidth
              label="Ícone"
              value={formData.icon}
              onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
              margin="normal"
              helperText="Nome do ícone do Material-UI"
            />
            <TextField
              fullWidth
              label="Cor"
              value={formData.color}
              onChange={(e) => setFormData({ ...formData, color: e.target.value })}
              margin="normal"
              type="color"
            />
            <TextField
              fullWidth
              label="Ordem"
              value={formData.sort_order}
              onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
              margin="normal"
              type="number"
            />
            <FormControl fullWidth margin="normal">
              <InputLabel>Status</InputLabel>
              <Select
                value={formData.is_active.toString()}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.value === 'true' })}
                label="Status"
              >
                <MenuItem value="true">Ativa</MenuItem>
                <MenuItem value="false">Inativa</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancelar</Button>
          <Button onClick={handleSubmit} variant="contained">
            {editingCategory ? 'Atualizar' : 'Criar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Categories;
