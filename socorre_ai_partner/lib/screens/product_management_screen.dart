import 'dart:async';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../models/product.dart';
import '../services/product_service.dart';

class ProductManagementScreen extends StatefulWidget {
  const ProductManagementScreen({super.key});

  @override
  State<ProductManagementScreen> createState() => _ProductManagementScreenState();
}

class _ProductManagementScreenState extends State<ProductManagementScreen> {
  List<Product> _products = [];
  bool _isLoading = true;
  String? _error;
  ProductCategory? _selectedCategory;
  bool _onlyActive = true;
  bool _onlyFeatured = false;
  final _searchController = TextEditingController();
  Timer? _refreshTimer;

  @override
  void initState() {
    super.initState();
    _loadProducts();
    _startAutoRefresh();
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  void _startAutoRefresh() {
    _refreshTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      _loadProducts();
    });
  }

  Future<void> _loadProducts() async {
    try {
      final products = await ProductService.getStoreProducts(
        category: _selectedCategory,
      );
      
      // Filtrar produtos
      var filteredProducts = products.where((product) {
        if (_onlyActive && !product.isActive) return false;
        if (_onlyFeatured && !product.isFeatured) return false;
        return true;
      }).toList();
      
      setState(() {
        _products = filteredProducts;
        _isLoading = false;
        _error = null;
      });
    } catch (e) {
      setState(() {
        _isLoading = false;
        _error = 'Erro ao carregar produtos: $e';
      });
    }
  }

  Future<void> _searchProducts(String query) async {
    if (query.isEmpty) {
      _loadProducts();
      return;
    }

    try {
      final allProducts = await ProductService.getStoreProducts();
      
      final filtered = allProducts.where((product) {
        if (_onlyActive && !product.isActive) return false;
        if (_onlyFeatured && !product.isFeatured) return false;
        return product.name.toLowerCase().contains(query.toLowerCase());
      }).toList();
      
      setState(() {
        _products = filtered;
      });
    } catch (e) {
      debugPrint('Erro ao buscar produtos: $e');
    }
  }

  void _showCreateProductDialog() {
    showDialog(
      context: context,
      builder: (context) => _CreateProductDialog(
        onSubmit: (productData) => _createProduct(productData),
      ),
    );
  }

  Future<void> _createProduct(Map<String, dynamic> productData) async {
    try {
      await ProductService.createProduct(
        name: productData['name'],
        description: productData['description'],
        category: productData['category'],
        type: productData['type'],
        price: productData['price'],
        stock: productData['stock'],
        sku: productData['sku'],
        unit: productData['unit'],
        brand: productData['brand'],
        tags: productData['tags'],
        photos: productData['photos'],
        specifications: productData['specifications'],
      );

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Produto criado com sucesso!'),
          backgroundColor: Colors.green,
        ),
      );

      Navigator.of(context).pop();
      _loadProducts();
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Erro ao criar produto: $e'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  void _showEditProductDialog(Product product) {
    showDialog(
      context: context,
      builder: (context) => _EditProductDialog(
        product: product,
        onSubmit: (productData) => _updateProduct(product.id, productData),
      ),
    );
  }

  Future<void> _updateProduct(String productId, Map<String, dynamic> productData) async {
    try {
      await ProductService.updateProduct(
        productId,
        name: productData['name'],
        description: productData['description'],
        category: productData['category'],
        type: productData['type'],
        price: productData['price'],
        stock: productData['stock'],
        unit: productData['unit'],
        brand: productData['brand'],
        tags: productData['tags'],
        photos: productData['photos'],
        specifications: productData['specifications'],
      );

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Produto atualizado com sucesso!'),
          backgroundColor: Colors.green,
        ),
      );

      Navigator.of(context).pop();
      _loadProducts();
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Erro ao atualizar produto: $e'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  Future<void> _toggleActive(Product product) async {
    try {
      await ProductService.toggleActive(product.id);
      _loadProducts();
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Erro ao alterar status: $e'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  Future<void> _toggleFeatured(Product product) async {
    try {
      await ProductService.toggleFeatured(product.id);
      _loadProducts();
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Erro ao alterar destaque: $e'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  Future<void> _deleteProduct(Product product) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Excluir Produto'),
        content: Text('Tem certeza que deseja excluir "${product.name}"?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Não'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red,
              foregroundColor: Colors.white,
            ),
            child: const Text('Sim'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    try {
      await ProductService.deleteProduct(product.id);
      
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Produto excluído com sucesso'),
          backgroundColor: Colors.green,
        ),
      );
      
      _loadProducts();
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Erro ao excluir produto: $e'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Gerenciar Produtos',
          style: GoogleFonts.poppins(
            fontWeight: FontWeight.w600,
          ),
        ),
        backgroundColor: Colors.purple[800],
        foregroundColor: Colors.white,
        elevation: 0,
        actions: [
          IconButton(
            onPressed: _loadProducts,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: Column(
        children: [
          // Barra de busca e filtros
          _buildSearchAndFilters(),
          
          // Lista de produtos
          Expanded(
            child: _buildProductsList(),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _showCreateProductDialog,
        backgroundColor: Colors.purple[800],
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add),
        label: Text(
          'Novo Produto',
          style: GoogleFonts.poppins(
            fontWeight: FontWeight.w500,
          ),
        ),
      ),
    );
  }

  Widget _buildSearchAndFilters() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.1),
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        children: [
          // Campo de busca
          TextField(
            controller: _searchController,
            decoration: InputDecoration(
              hintText: 'Buscar produtos...',
              prefixIcon: const Icon(Icons.search),
              suffixIcon: _searchController.text.isNotEmpty
                  ? IconButton(
                      onPressed: () {
                        _searchController.clear();
                        _searchProducts('');
                      },
                      icon: const Icon(Icons.clear),
                    )
                  : null,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
              ),
            ),
            onChanged: _searchProducts,
          ),
          
          const SizedBox(height: 12),
          
          // Filtros
          Row(
            children: [
              // Filtro de categoria
              Expanded(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    border: Border.all(color: Colors.grey[300]!),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: DropdownButtonHideUnderline(
                    child: DropdownButton<ProductCategory?>(
                      value: _selectedCategory,
                      hint: Text(
                        'Categoria',
                        style: GoogleFonts.poppins(color: Colors.grey[600]),
                      ),
                      isExpanded: true,
                      items: [
                        const DropdownMenuItem<ProductCategory?>(
                          value: null,
                          child: Text('Todas'),
                        ),
                        ...ProductCategory.values.map((category) {
                          return DropdownMenuItem<ProductCategory>(
                            value: category,
                            child: Row(
                              children: [
                                Text(category.icon),
                                const SizedBox(width: 8),
                                Text(category.displayName),
                              ],
                            ),
                          );
                        }),
                      ],
                      onChanged: (category) {
                        setState(() => _selectedCategory = category);
                        _loadProducts();
                      },
                    ),
                  ),
                ),
              ),
              
              const SizedBox(width: 12),
              
              // Filtros rápidos
              FilterChip(
                label: Text('Ativos'),
                selected: _onlyActive,
                onSelected: (value) {
                  setState(() => _onlyActive = value);
                  _loadProducts();
                },
                backgroundColor: _onlyActive ? Colors.green[100] : Colors.grey[200],
                labelStyle: TextStyle(
                  color: _onlyActive ? Colors.green[800] : Colors.grey[700],
                ),
              ),
              
              const SizedBox(width: 8),
              
              FilterChip(
                label: Text('Destaque'),
                selected: _onlyFeatured,
                onSelected: (value) {
                  setState(() => _onlyFeatured = value);
                  _loadProducts();
                },
                backgroundColor: _onlyFeatured ? Colors.amber[100] : Colors.grey[200],
                labelStyle: TextStyle(
                  color: _onlyFeatured ? Colors.amber[800] : Colors.grey[700],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildProductsList() {
    if (_isLoading) {
      return const Center(
        child: CircularProgressIndicator(),
      );
    }

    if (_error != null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.error_outline,
              size: 64,
              color: Colors.red[400],
            ),
            const SizedBox(height: 16),
            Text(
              _error!,
              style: GoogleFonts.poppins(
                fontSize: 16,
                color: Colors.red[600],
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: _loadProducts,
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.purple[800],
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
              ),
              child: Text(
                'Tentar novamente',
                style: GoogleFonts.poppins(
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ],
        ),
      );
    }

    if (_products.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.inventory_2,
              size: 64,
              color: Colors.grey[400],
            ),
            const SizedBox(height: 16),
            Text(
              'Nenhum produto encontrado',
              style: GoogleFonts.poppins(
                fontSize: 18,
                color: Colors.grey[600],
                fontWeight: FontWeight.w500,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Adicione produtos ao seu catálogo',
              style: GoogleFonts.poppins(
                fontSize: 14,
                color: Colors.grey[500],
              ),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadProducts,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _products.length,
        itemBuilder: (context, index) {
          final product = _products[index];
          return _ProductCard(product: product);
        },
      ),
    );
  }

  Widget _ProductCard({required Product product}) {
    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      elevation: 4,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(
          color: !product.isActive 
              ? Colors.red 
              : product.isFeatured 
                  ? Colors.amber 
                  : Colors.transparent,
          width: 2,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header com status e ações
            Row(
              children: [
                // Status
                Row(
                  children: [
                    if (!product.isActive)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: Colors.red,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          'Inativo',
                          style: GoogleFonts.poppins(
                            color: Colors.white,
                            fontSize: 10,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    if (product.isFeatured)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: Colors.amber,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          'Destaque',
                          style: GoogleFonts.poppins(
                            color: Colors.white,
                            fontSize: 10,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                  ],
                ),
                const Spacer(),
                // Ações rápidas
                Row(
                  children: [
                  IconButton(
                    onPressed: () => _toggleActive(product),
                    icon: Icon(
                      product.isActive ? Icons.visibility : Icons.visibility_off,
                      color: product.isActive ? Colors.green : Colors.grey,
                    ),
                  ),
                  IconButton(
                    onPressed: () => _toggleFeatured(product),
                    icon: Icon(
                      product.isFeatured ? Icons.star : Icons.star_border,
                      color: product.isFeatured ? Colors.amber : Colors.grey,
                    ),
                  ),
                  PopupMenuButton(
                    icon: const Icon(Icons.more_vert),
                    itemBuilder: (context) => [
                      PopupMenuItem(
                        value: 'edit',
                        child: Row(
                          children: [
                            const Icon(Icons.edit),
                            const SizedBox(width: 8),
                            Text('Editar'),
                          ],
                        ),
                      ),
                      PopupMenuItem(
                        value: 'delete',
                        child: Row(
                          children: [
                            const Icon(Icons.delete, color: Colors.red),
                            const SizedBox(width: 8),
                            Text('Excluir', style: TextStyle(color: Colors.red)),
                          ],
                        ),
                      ),
                    ],
                    onSelected: (value) {
                      if (value == 'edit') {
                        _showEditProductDialog(product);
                      } else if (value == 'delete') {
                        _deleteProduct(product);
                      }
                    },
                  ),
                  ],
                ),
              ],
            ),

            const SizedBox(height: 12),

            // Nome e categoria
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        product.name,
                        style: GoogleFonts.poppins(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Text(
                            product.category.icon,
                            style: const TextStyle(fontSize: 16),
                          ),
                          const SizedBox(width: 4),
                          Text(
                            product.category.displayName,
                            style: GoogleFonts.poppins(
                              fontSize: 12,
                              color: Colors.grey[600],
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                // Foto
                Container(
                  width: 60,
                  height: 60,
                  decoration: BoxDecoration(
                    color: Colors.grey[200],
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: product.mainPhoto.isNotEmpty
                      ? ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: Image.network(
                            product.mainPhoto,
                            fit: BoxFit.cover,
                            errorBuilder: (context, error, stackTrace) {
                              return Icon(
                                Icons.image,
                                color: Colors.grey[400],
                              );
                            },
                          ),
                        )
                      : Icon(
                          Icons.inventory_2,
                          color: Colors.grey[400],
                        ),
                ),
              ],
            ),
            
            const SizedBox(height: 12),
            
            // Preço e estoque
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Preço',
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        color: Colors.grey[600],
                      ),
                    ),
                    Text(
                      product.formattedPrice,
                      style: GoogleFonts.poppins(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: Colors.green[700],
                      ),
                    ),
                  ],
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      'Estoque',
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        color: Colors.grey[600],
                      ),
                    ),
                    Text(
                      '${product.stock}',
                      style: GoogleFonts.poppins(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: product.isOutOfStock
                            ? Colors.red
                            : product.isLowStock
                                ? Colors.orange
                                : Colors.green[700],
                      ),
                    ),
                  ],
                ),
              ],
            ),
            
            if (product.brand?.isNotEmpty == true) ...[
              const SizedBox(height: 8),
              Text(
                'Marca: ${product.brand!}',
                style: GoogleFonts.poppins(
                  fontSize: 12,
                  color: Colors.grey[600],
                ),
              ),
            ],
            
            if (product.description.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                product.description,
                style: GoogleFonts.poppins(
                  fontSize: 12,
                  color: Colors.grey[600],
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ],
            
            if (product.rating != null && product.rating! > 0) ...[
              const SizedBox(height: 8),
              Row(
                children: [
                  Icon(
                    Icons.star,
                    size: 16,
                    color: Colors.amber,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    product.rating!.toStringAsFixed(1),
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      color: Colors.grey[600],
                    ),
                  ),
                  if (product.reviewCount != null && product.reviewCount! > 0) ...[
                    const SizedBox(width: 4),
                    Text(
                      '(${product.reviewCount})',
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        color: Colors.grey[500],
                      ),
                    ),
                  ],
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _CreateProductDialog extends StatefulWidget {
  final Function(Map<String, dynamic>) onSubmit;

  const _CreateProductDialog({required this.onSubmit});

  @override
  State<_CreateProductDialog> createState() => _CreateProductDialogState();
}

class _CreateProductDialogState extends State<_CreateProductDialog> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _priceController = TextEditingController();
  final _stockController = TextEditingController();
  final _skuController = TextEditingController();
  final _unitController = TextEditingController();
  final _brandController = TextEditingController();
  
  ProductCategory _selectedCategory = ProductCategory.other;
  ProductType _selectedType = ProductType.other;
  final List<String> _tags = [];
  final List<String> _photos = [];
  final Map<String, dynamic> _specifications = {};
  
  final bool _isLoading = false;
  String? _error;

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(
        'Novo Produto',
        style: GoogleFonts.poppins(
          fontWeight: FontWeight.w600,
        ),
      ),
      content: SingleChildScrollView(
        child: Form(
          key: _formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Nome
              TextFormField(
                controller: _nameController,
                decoration: const InputDecoration(
                  labelText: 'Nome do Produto',
                  border: OutlineInputBorder(),
                ),
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return 'Nome é obrigatório';
                  }
                  return null;
                },
              ),
              
              const SizedBox(height: 16),
              
              // Descrição
              TextFormField(
                controller: _descriptionController,
                maxLines: 3,
                decoration: const InputDecoration(
                  labelText: 'Descrição',
                  border: OutlineInputBorder(),
                ),
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return 'Descrição é obrigatória';
                  }
                  return null;
                },
              ),
              
              const SizedBox(height: 16),
              
              // Categoria e Tipo
              Row(
                children: [
                  Expanded(
                    child: DropdownButtonFormField<ProductCategory>(
                      initialValue: _selectedCategory,
                      decoration: const InputDecoration(
                        labelText: 'Categoria',
                        border: OutlineInputBorder(),
                      ),
                      items: ProductCategory.values.map((category) {
                        return DropdownMenuItem<ProductCategory>(
                          value: category,
                          child: Text(category.displayName),
                        );
                      }).toList(),
                      onChanged: (value) => setState(() => _selectedCategory = value!),
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: DropdownButtonFormField<ProductType>(
                      initialValue: _selectedType,
                      decoration: const InputDecoration(
                        labelText: 'Tipo',
                        border: OutlineInputBorder(),
                      ),
                      items: ProductType.values.map((type) {
                        return DropdownMenuItem<ProductType>(
                          value: type,
                          child: Text(type.displayName),
                        );
                      }).toList(),
                      onChanged: (value) => setState(() => _selectedType = value!),
                    ),
                  ),
                ],
              ),
              
              const SizedBox(height: 16),
              
              // Preço e Estoque
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _priceController,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'Preço (R\$)',
                        prefixText: 'R\$ ',
                        border: OutlineInputBorder(),
                      ),
                      validator: (value) {
                        final price = double.tryParse(value ?? '');
                        if (price == null || price <= 0) {
                          return 'Preço inválido';
                        }
                        return null;
                      },
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: TextFormField(
                      controller: _stockController,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'Estoque',
                        border: OutlineInputBorder(),
                      ),
                      validator: (value) {
                        final stock = int.tryParse(value ?? '');
                        if (stock == null || stock < 0) {
                          return 'Estoque inválido';
                        }
                        return null;
                      },
                    ),
                  ),
                ],
              ),
              
              const SizedBox(height: 16),
              
              // SKU, Unidade e Marca
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _skuController,
                      decoration: const InputDecoration(
                        labelText: 'SKU (opcional)',
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: TextFormField(
                      controller: _unitController,
                      decoration: const InputDecoration(
                        labelText: 'Unidade (opcional)',
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: TextFormField(
                      controller: _brandController,
                      decoration: const InputDecoration(
                        labelText: 'Marca (opcional)',
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ),
                ],
              ),
              
              const SizedBox(height: 16),
              
              // Botão de submit
              if (_error != null) ...[
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.red[50],
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    _error!,
                    style: GoogleFonts.poppins(
                      color: Colors.red[700],
                      fontSize: 12,
                    ),
                  ),
                ),
                const SizedBox(height: 8),
              ],
              
              Row(
                children: [
                  TextButton(
                    onPressed: () => Navigator.of(context).pop(),
                    child: Text(
                      'Cancelar',
                      style: GoogleFonts.poppins(),
                    ),
                  ),
                  const SizedBox(width: 16),
                  ElevatedButton(
                    onPressed: _isLoading ? null : _submit,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.purple[800],
                      foregroundColor: Colors.white,
                    ),
                    child: _isLoading
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : Text(
                            'Criar',
                            style: GoogleFonts.poppins(
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
      actions: [],
    );
  }

  void _submit() {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    final productData = {
      'name': _nameController.text.trim(),
      'description': _descriptionController.text.trim(),
      'category': _selectedCategory,
      'type': _selectedType,
      'price': double.parse(_priceController.text),
      'stock': int.parse(_stockController.text),
      'sku': _skuController.text.trim().isEmpty ? null : _skuController.text.trim(),
      'unit': _unitController.text.trim().isEmpty ? null : _unitController.text.trim(),
      'brand': _brandController.text.trim().isEmpty ? null : _brandController.text.trim(),
      'tags': _tags,
      'photos': _photos,
      'specifications': _specifications,
    };

    widget.onSubmit(productData);
  }
}

class _EditProductDialog extends StatefulWidget {
  final Product product;
  final Function(Map<String, dynamic>) onSubmit;

  const _EditProductDialog({
    required this.product,
    required this.onSubmit,
  });

  @override
  State<_EditProductDialog> createState() => _EditProductDialogState();
}

class _EditProductDialogState extends State<_EditProductDialog> {
  late final TextEditingController _nameController;
  late final TextEditingController _descriptionController;
  late final TextEditingController _priceController;
  late final TextEditingController _stockController;
  late final TextEditingController _skuController;
  late final TextEditingController _unitController;
  late final TextEditingController _brandController;
  
  late ProductCategory _selectedCategory;
  late ProductType _selectedType;
  List<String> _tags = [];
  List<String> _photos = [];
  Map<String, dynamic> _specifications = {};
  
  final bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    
    _nameController = TextEditingController(text: widget.product.name);
    _descriptionController = TextEditingController(text: widget.product.description);
    _priceController = TextEditingController(text: widget.product.price.toString());
    _stockController = TextEditingController(text: widget.product.stock.toString());
    _skuController = TextEditingController(text: widget.product.sku);
    _unitController = TextEditingController(text: widget.product.unit ?? '');
    _brandController = TextEditingController(text: widget.product.brand ?? '');
    _selectedCategory = widget.product.category;
    _selectedType = widget.product.type;
    _tags = widget.product.tags ?? [];
    _photos = widget.product.photos ?? [];
    _specifications = widget.product.specifications ?? {};
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(
        'Editar Produto',
        style: GoogleFonts.poppins(
          fontWeight: FontWeight.w600,
        ),
      ),
      content: SingleChildScrollView(
        child: Form(
          key: GlobalKey<FormState>(),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Campos (reutilizados do CreateProductDialog)
              // ... (mesmo código do CreateProductDialog)
              Row(
                children: [
                  TextButton(
                    onPressed: () => Navigator.of(context).pop(),
                    child: Text(
                      'Cancelar',
                      style: GoogleFonts.poppins(),
                    ),
                  ),
                  const SizedBox(width: 16),
                  ElevatedButton(
                    onPressed: _isLoading ? null : _submit,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.purple[800],
                      foregroundColor: Colors.white,
                    ),
                    child: _isLoading
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : Text(
                            'Salvar',
                            style: GoogleFonts.poppins(
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
      actions: [],
    );
  }

  void _submit() {
    // ... (mesma lógica do CreateProductDialog)
    final productData = {
      'name': _nameController.text.trim(),
      'description': _descriptionController.text.trim(),
      'category': _selectedCategory,
      'type': _selectedType,
      'price': double.parse(_priceController.text),
      'stock': int.parse(_stockController.text),
      'sku': _skuController.text.trim().isEmpty ? null : _skuController.text.trim(),
      'unit': _unitController.text.trim().isEmpty ? null : _unitController.text.trim(),
      'brand': _brandController.text.trim().isEmpty ? null : _brandController.text.trim(),
      'tags': _tags,
      'photos': _photos,
      'specifications': _specifications,
    };

    widget.onSubmit(productData);
  }
}
