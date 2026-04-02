const db = require('../config/database');

// Buscar todas as categorias
const getCategories = async (req, res) => {
  try {
    const categories = await db('categories')
      .where('is_active', true)
      .orderBy('sort_order', 'asc')
      .select('*');

    res.json({
      success: true,
      message: 'Categorias carregadas com sucesso',
      data: categories
    });
  } catch (error) {
    console.error('Erro ao buscar categorias:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
};

// Buscar categoria por ID
const getCategoryById = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await db('categories')
      .where({ id, is_active: true })
      .first();

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Categoria não encontrada'
      });
    }

    res.json({
      success: true,
      message: 'Categoria carregada com sucesso',
      data: category
    });
  } catch (error) {
    console.error('Erro ao buscar categoria:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
};

// Criar nova categoria
const createCategory = async (req, res) => {
  try {
    const { name, description, icon, color, sort_order } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Nome da categoria é obrigatório'
      });
    }

    const [categoryId] = await db('categories').insert({
      name,
      description: description || '',
      icon: icon || 'category',
      color: color || '#002F6C',
      sort_order: sort_order || 0,
      is_active: true
    }).returning('id');

    const newCategory = await db('categories')
      .where({ id: categoryId })
      .first();

    res.status(201).json({
      success: true,
      message: 'Categoria criada com sucesso',
      data: newCategory
    });
  } catch (error) {
    console.error('Erro ao criar categoria:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
};

// Atualizar categoria
const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, icon, color, sort_order, is_active } = req.body;

    const category = await db('categories')
      .where({ id })
      .first();

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Categoria não encontrada'
      });
    }

    await db('categories')
      .where({ id })
      .update({
        name: name || category.name,
        description: description !== undefined ? description : category.description,
        icon: icon || category.icon,
        color: color || category.color,
        sort_order: sort_order !== undefined ? sort_order : category.sort_order,
        is_active: is_active !== undefined ? is_active : category.is_active,
        updated_at: db.fn.now()
      });

    const updatedCategory = await db('categories')
      .where({ id })
      .first();

    res.json({
      success: true,
      message: 'Categoria atualizada com sucesso',
      data: updatedCategory
    });
  } catch (error) {
    console.error('Erro ao atualizar categoria:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
};

// Excluir categoria
const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;

    const category = await db('categories')
      .where({ id })
      .first();

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Categoria não encontrada'
      });
    }

    // Soft delete - apenas marca como inativa
    await db('categories')
      .where({ id })
      .update({
        is_active: false,
        updated_at: db.fn.now()
      });

    res.json({
      success: true,
      message: 'Categoria excluída com sucesso'
    });
  } catch (error) {
    console.error('Erro ao excluir categoria:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
};

module.exports = {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory
};
