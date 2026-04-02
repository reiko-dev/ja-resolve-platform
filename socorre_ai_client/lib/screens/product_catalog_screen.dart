import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../models/product.dart';
import '../services/product_service.dart';
import 'package:intl/intl.dart';

class ProductCatalogScreen extends StatefulWidget {
  final ProductCategory? category;
  final ProductType? type;
  final String? searchQuery;

  const ProductCatalogScreen({
    super.key,
    this.category,
    this.type,
    this.searchQuery,
  });

  @override
  State<ProductCatalogScreen> createState() => _ProductCatalogScreenState();
}

class _ProductCatalogScreenState extends State<ProductCatalogScreen> {
  List<Product> _products = [];
  List<Product> _filteredProducts = [];
  bool _isLoading = true;
  String? _error;
  int _currentPage = 1;
  bool _hasMore = true;
  bool _isLoadingMore = false;
  
  // Filtros
  ProductCategory? _selectedCategory;
  ProductType? _selectedType;
  String _searchQuery = '';
  double _minPrice = 0;
  double _maxPrice = 1000;
  bool _onlyAvailable = true;
  bool _sortByPrice = false;
  bool _sortByRating = false;
  
  final _searchController = TextEditingController();
  final _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _selectedCategory = widget.category;
    _selectedType = widget.type;
    _searchQuery = widget.searchQuery ?? '';
    _searchController.text = _searchQuery;
    _loadProducts();
    
    _scrollController.addListener(() {
      if (_scrollController.position.pixels >= _scrollController.position.maxScrollExtent - 200) {
        _loadMoreProducts();
      }
    });
  }

  @override
  void dispose() {
    _scrollController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadProducts({bool refresh = false}) async {
    if (refresh) {
      setState(() {
        _currentPage = 1;
        _hasMore = true;
        _isLoading = true;
        _error = null;
      });
    }

    try {
      final products = await ProductService.getProducts(
        category: _selectedCategory,
        type: _selectedType,
        search: _searchQuery.isEmpty ? null : _searchQuery,
        featured: null,
        active: _onlyAvailable,
        page: _currentPage,
        limit: 20,
      );

      setState(() {
        if (refresh) {
          _products = products;
        } else {
          _products.addAll(products);
        }
        _filteredProducts = _applyFilters(_products);
        _isLoading = false;
        _isLoadingMore = false;
        _hasMore = products.length == 20; // Se retornou 20, pode ter mais
        _error = null;
      });
    } catch (e) {
      setState(() {
        _isLoading = false;
        _isLoadingMore = false;
        _error = 'Erro ao carregar produtos: $e';
      });
    }
  }

  Future<void> _loadMoreProducts() async {
    if (_isLoadingMore || !_hasMore) return;

    setState(() => _isLoadingMore = true);
    _currentPage++;
    
    await _loadProducts();
  }

  List<Product> _applyFilters(List<Product> products) {
    var filtered = List<Product>.from(products);

    // Filtrar por preço
    filtered = filtered.where((product) {
      return product.price >= _minPrice && product.price <= _maxPrice;
    }).toList();

    // Ordenar
    if (_sortByPrice) {
      filtered.sort((a, b) => a.price.compareTo(b.price));
    } else if (_sortByRating) {
      filtered.sort((a, b) => (b.rating ?? 0).compareTo(a.rating ?? 0));
    }

    return filtered;
  }

  void _onSearchChanged(String query) {
    setState(() {
      _searchQuery = query;
      _currentPage = 1;
      _hasMore = true;
    });
    _loadProducts(refresh: true);
  }

  void _onCategoryChanged(ProductCategory? category) {
    setState(() {
      _selectedCategory = category;
      _currentPage = 1;
      _hasMore = true;
    });
    _loadProducts(refresh: true);
  }

  void _onTypeChanged(ProductType? type) {
    setState(() {
      _selectedType = type;
      _currentPage = 1;
      _hasMore = true;
    });
    _loadProducts(refresh: true);
  }

  void _showFilterDialog() {
    showDialog(
      context: context,
      builder: (context) => _FilterDialog(
        minPrice: _minPrice,
        maxPrice: _maxPrice,
        onlyAvailable: _onlyAvailable,
        sortByPrice: _sortByPrice,
        sortByRating: _sortByRating,
        onApply: (minPrice, maxPrice, onlyAvailable, sortByPrice, sortByRating) {
          setState(() {
            _minPrice = minPrice;
            _maxPrice = maxPrice;
            _onlyAvailable = onlyAvailable;
            _sortByPrice = sortByPrice;
            _sortByRating = sortByRating;
          });
          _loadProducts(refresh: true);
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Catálogo de Produtos',
          style: GoogleFonts.poppins(
            fontWeight: FontWeight.w600,
          ),
        ),
        backgroundColor: Colors.blue[800],
        foregroundColor: Colors.white,
        elevation: 0,
        actions: [
          IconButton(
            onPressed: _showFilterDialog,
            icon: const Icon(Icons.filter_list),
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
                        _onSearchChanged('');
                      },
                      icon: const Icon(Icons.clear),
                    )
                  : null,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
              ),
            ),
            onChanged: _onSearchChanged,
          ),
          
          const SizedBox(height: 12),
          
          // Filtros de categoria e tipo
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
                      onChanged: _onCategoryChanged,
                    ),
                  ),
                ),
              ),
              
              const SizedBox(width: 12),
              
              // Filtro de tipo
              Expanded(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    border: Border.all(color: Colors.grey[300]!),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: DropdownButtonHideUnderline(
                    child: DropdownButton<ProductType?>(
                      value: _selectedType,
                      hint: Text(
                        'Tipo',
                        style: GoogleFonts.poppins(color: Colors.grey[600]),
                      ),
                      isExpanded: true,
                      items: [
                        const DropdownMenuItem<ProductType?>(
                          value: null,
                          child: Text('Todos'),
                        ),
                        ...ProductType.values.map((type) {
                          return DropdownMenuItem<ProductType>(
                            value: type,
                            child: Row(
                              children: [
                                Text(type.icon),
                                const SizedBox(width: 8),
                                Text(type.displayName),
                              ],
                            ),
                          );
                        }),
                      ],
                      onChanged: _onTypeChanged,
                    ),
                  ),
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
              onPressed: () => _loadProducts(refresh: true),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.blue[800],
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

    if (_filteredProducts.isEmpty) {
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
              'Tente ajustar os filtros ou busca',
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
      onRefresh: () => _loadProducts(refresh: true),
      child: GridView.builder(
        controller: _scrollController,
        padding: const EdgeInsets.all(16),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          childAspectRatio: 0.75,
          crossAxisSpacing: 16,
          mainAxisSpacing: 16,
        ),
        itemCount: _filteredProducts.length + (_isLoadingMore ? 1 : 0),
        itemBuilder: (context, index) {
          if (index == _filteredProducts.length && _isLoadingMore) {
            return const Center(
              child: CircularProgressIndicator(),
            );
          }
          
          final product = _filteredProducts[index];
          return _ProductCard(product: product);
        },
      ),
    );
  }

  Widget _ProductCard({required Product product}) {
    return Card(
      elevation: 4,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
      ),
      child: InkWell(
        onTap: () {
          // TODO: Navegar para detalhes do produto
        },
        borderRadius: BorderRadius.circular(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Imagem do produto
            Expanded(
              flex: 3,
              child: Container(
                width: double.infinity,
                decoration: BoxDecoration(
                  color: Colors.grey[100],
                  borderRadius: const BorderRadius.vertical(
                    top: Radius.circular(12),
                  ),
                ),
                child: product.mainPhoto.isNotEmpty
                    ? ClipRRect(
                        borderRadius: const BorderRadius.vertical(
                          top: Radius.circular(12),
                        ),
                        child: Image.network(
                          product.mainPhoto,
                          fit: BoxFit.cover,
                          errorBuilder: (context, error, stackTrace) {
                            return Icon(
                              Icons.image,
                              color: Colors.grey[400],
                              size: 48,
                            );
                          },
                        ),
                      )
                    : Icon(
                        Icons.inventory_2,
                        color: Colors.grey[400],
                        size: 48,
                      ),
              ),
            ),
            
            // Informações do produto
            Expanded(
              flex: 2,
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Nome
                    Text(
                      product.name,
                      style: GoogleFonts.poppins(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    
                    const SizedBox(height: 4),
                    
                    // Loja
                    Text(
                      product.storeName,
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        color: Colors.grey[600],
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    
                    const SizedBox(height: 4),
                    
                    // Preço e estoque
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Text(
                            product.formattedPrice,
                            style: GoogleFonts.poppins(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                              color: Colors.green[700],
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        
                        // Indicador de estoque
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: product.isOutOfStock 
                                ? Colors.red 
                                : product.isLowStock 
                                    ? Colors.orange 
                                    : Colors.green,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Text(
                            product.isOutOfStock 
                                ? 'Esgotado'
                                : product.isLowStock 
                                    ? 'Pouco'
                                    : 'Disponível',
                            style: GoogleFonts.poppins(
                              fontSize: 10,
                              color: Colors.white,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ),
                    
                    // Rating
                    if (product.rating != null && product.rating! > 0)
                      Row(
                        children: [
                          Icon(
                            Icons.star,
                            size: 12,
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
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FilterDialog extends StatefulWidget {
  final double minPrice;
  final double maxPrice;
  final bool onlyAvailable;
  final bool sortByPrice;
  final bool sortByRating;
  final Function(double, double, bool, bool, bool) onApply;

  const _FilterDialog({
    super.key,
    required this.minPrice,
    required this.maxPrice,
    required this.onlyAvailable,
    required this.sortByPrice,
    required this.sortByRating,
    required this.onApply,
  });

  @override
  State<_FilterDialog> createState() => _FilterDialogState();
}

class _FilterDialogState extends State<_FilterDialog> {
  late double _minPrice;
  late double _maxPrice;
  late bool _onlyAvailable;
  late bool _sortByPrice;
  late bool _sortByRating;

  @override
  void initState() {
    super.initState();
    _minPrice = widget.minPrice;
    _maxPrice = widget.maxPrice;
    _onlyAvailable = widget.onlyAvailable;
    _sortByPrice = widget.sortByPrice;
    _sortByRating = widget.sortByRating;
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(
        'Filtros',
        style: GoogleFonts.poppins(
          fontWeight: FontWeight.w600,
        ),
      ),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Filtro de preço
            Text(
              'Faixa de Preço',
              style: GoogleFonts.poppins(
                fontWeight: FontWeight.w500,
                color: Colors.grey[700],
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    decoration: const InputDecoration(
                      labelText: 'Mínimo',
                      prefixText: 'R$ ',
                    ),
                    keyboardType: TextInputType.number,
                    onChanged: (value) {
                      _minPrice = double.tryParse(value) ?? 0;
                    },
                    initialValue: _minPrice.toStringAsFixed(2),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: TextField(
                    decoration: const InputDecoration(
                      labelText: 'Máximo',
                      prefixText: 'R$ ',
                    ),
                    keyboardType: TextInputType.number,
                    onChanged: (value) {
                      _maxPrice = double.tryParse(value) ?? 1000;
                    },
                    initialValue: _maxPrice.toStringAsFixed(2),
                  ),
                ),
              ],
            ),
            
            const SizedBox(height: 16),
            
            // Checkbox de disponibilidade
            CheckboxListTile(
              value: _onlyAvailable,
              onChanged: (value) {
                setState(() {
                  _onlyAvailable = value!;
                });
              },
              title: Text(
                'Apenas produtos disponíveis',
                style: GoogleFonts.poppins(),
              ),
            ),
            
            const SizedBox(height: 16),
            
            // Ordenação
            Text(
              'Ordenar por',
              style: GoogleFonts.poppins(
                fontWeight: FontWeight.w500,
                color: Colors.grey[700],
              ),
            ),
            const SizedBox(height: 8),
            CheckboxListTile(
              value: _sortByPrice,
              onChanged: (value) {
                setState(() {
                  _sortByPrice = value!;
                  if (value) _sortByRating = false;
                });
              },
              title: Text(
                'Preço (menor para maior)',
                style: GoogleFonts.poppins(),
              ),
            ),
            CheckboxListTile(
              value: _sortByRating,
              onChanged: (value) {
                setState(() {
                  _sortByRating = value!;
                  if (value) _sortByPrice = false;
                });
              },
              title: Text(
                'Avaliação (maior para menor)',
                style: GoogleFonts.poppins(),
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(
            'Cancelar',
            style: GoogleFonts.poppins(),
          ),
        ),
        ElevatedButton(
          onPressed: () {
            widget.onApply(
              _minPrice,
              _maxPrice,
              _onlyAvailable,
              _sortByPrice,
              _sortByRating,
            );
            Navigator.of(context).pop();
          },
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.blue[800],
            foregroundColor: Colors.white,
          ),
          child: Text(
            'Aplicar',
            style: GoogleFonts.poppins(
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
      ],
    );
  }
}
