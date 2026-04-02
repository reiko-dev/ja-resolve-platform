import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:geolocator/geolocator.dart';
import 'package:geocoding/geocoding.dart';
import '../models/delivery_order.dart';
import '../models/product.dart';
import '../services/delivery_order_service.dart';
import '../services/product_service.dart';
import 'dart:async';

class DeliveryOrderScreen extends StatefulWidget {
  final Map<String, dynamic>? arguments;

  const DeliveryOrderScreen({super.key, this.arguments});

  @override
  State<DeliveryOrderScreen> createState() => _DeliveryOrderScreenState();
}

class _DeliveryOrderScreenState extends State<DeliveryOrderScreen> {
  final _formKey = GlobalKey<FormState>();
  final _notesController = TextEditingController();
  
  DeliveryOrderType _selectedType = DeliveryOrderType.fuel;
  List<Product> _availableProducts = [];
  List<OrderItem> _selectedItems = [];
  Product? _selectedStore;
  
  String _pickupAddress = "Obtendo localização...";
  double? _pickupLatitude;
  double? _pickupLongitude;
  
  String _deliveryAddress = "";
  double? _deliveryLatitude;
  double? _deliveryLongitude;
  
  bool _isLoading = false;
  bool _isLoadingStores = false;
  bool _isLoadingProducts = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _getCurrentLocation();
    _loadAvailableStores();
  }

  Future<void> _getCurrentLocation() async {
    try {
      final position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      );
      
      if (!mounted) return;
      
      setState(() {
        _pickupLatitude = position.latitude;
        _pickupLongitude = position.longitude;
      });
      
      // Obter endereço
      final placemarks = await placemarkFromCoordinates(
        position.latitude,
        position.longitude,
      );
      
      if (!mounted) return;
      
      if (placemarks.isNotEmpty) {
        final place = placemarks.first;
        setState(() {
          _pickupAddress = "${place.street}, ${place.locality}";
          _deliveryAddress = _pickupAddress;
          _deliveryLatitude = position.latitude;
          _deliveryLongitude = position.longitude;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _pickupAddress = "Erro ao obter localização";
        });
      }
    }
  }

  Future<void> _loadAvailableStores() async {
    try {
      setState(() => _isLoadingStores = true);
      
      // Carregar produtos disponíveis para o tipo selecionado
      final products = _selectedType == DeliveryOrderType.fuel
          ? await ProductService.getFuels()
          : await ProductService.getAutoParts();
      
      // Agrupar por loja
      final stores = <String, List<Product>>{};
      for (final product in products) {
        if (!stores.containsKey(product.storeName)) {
          stores[product.storeName] = [];
        }
        stores[product.storeName]!.add(product);
      }
      
      // Converter para lista de lojas
      final storeList = stores.entries.map((entry) {
        final storeName = entry.key;
        final products = entry.value;
        final firstProduct = products.first;
        
        return Product(
          id: firstProduct.storeId,
          storeId: firstProduct.storeId,
          storeName: storeName,
          sku: '',
          name: storeName,
          description: '',
          category: firstProduct.category,
          type: firstProduct.type,
          price: 0.0,
          stock: 0,
          createdAt: firstProduct.createdAt,
          updatedAt: firstProduct.updatedAt,
          isActive: true,
          isFeatured: false,
        );
      }).toList();
      
      setState(() {
        _availableProducts = storeList;
        _isLoadingStores = false;
      });
    } catch (e) {
      setState(() {
        _isLoadingStores = false;
        _error = 'Erro ao carregar lojas: $e';
      });
    }
  }

  Future<void> _loadStoreProducts() async {
    if (_selectedStore == null) return;
    
    try {
      setState(() => _isLoadingProducts = true);
      
      final products = await ProductService.getStoreProducts(_selectedStore!.storeId);
      
      setState(() {
        _availableProducts = products;
        _isLoadingProducts = false;
      });
    } catch (e) {
      setState(() {
        _isLoadingProducts = false;
        _error = 'Erro ao carregar produtos: $e';
      });
    }
  }

  void _onTypeChanged(DeliveryOrderType type) {
    setState(() {
      _selectedType = type;
      _selectedStore = null;
      _selectedItems.clear();
    });
    _loadAvailableStores();
  }

  void _onStoreChanged(Product store) {
    setState(() {
      _selectedStore = store;
      _selectedItems.clear();
    });
    _loadStoreProducts();
  }

  void _addProduct(Product product, int quantity) {
    setState(() {
      // Verificar se produto já está na lista
      final existingIndex = _selectedItems.indexWhere(
        (item) => item.productId == product.id,
      );
      
      if (existingIndex >= 0) {
        // Atualizar quantidade
        _selectedItems[existingIndex] = OrderItem(
          productId: product.id,
          name: product.name,
          price: product.price,
          quantity: _selectedItems[existingIndex].quantity + quantity,
          total: product.price * (_selectedItems[existingIndex].quantity + quantity),
        );
      } else {
        // Adicionar novo item
        _selectedItems.add(OrderItem(
          productId: product.id,
          name: product.name,
          price: product.price,
          quantity: quantity,
          total: product.price * quantity,
        ));
      }
    });
  }

  void _removeProduct(int index) {
    setState(() {
      _selectedItems.removeAt(index);
    });
  }

  double get _itemsTotal {
    return _selectedItems.fold(0.0, (sum, item) => sum + item.total);
  }

  double get _deliveryFee {
    if (_pickupLatitude == null || _pickupLongitude == null || 
        _deliveryLatitude == null || _deliveryLongitude == null) {
      return 0.0;
    }
    
    final distance = Geolocator.distanceBetween(
      _pickupLatitude!,
      _pickupLongitude!,
      _deliveryLatitude!,
      _deliveryLongitude!,
    ) / 1000; // Converter para km
    
    return DeliveryOrderService.calculateDeliveryFee(distance, _selectedType);
  }

  double get _totalAmount => _itemsTotal + _deliveryFee;

  Future<void> _submitOrder() async {
    if (!_formKey.currentState!.validate()) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Por favor, preencha todos os campos obrigatórios'),
          backgroundColor: Colors.orange,
        ),
      );
      return;
    }

    if (_selectedStore == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Selecione uma loja'),
          backgroundColor: Colors.orange,
        ),
      );
      return;
    }

    if (_selectedItems.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Adicione pelo menos um produto'),
          backgroundColor: Colors.orange,
        ),
      );
      return;
    }

    if (_pickupLatitude == null || _pickupLongitude == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Aguardando localização...'),
          backgroundColor: Colors.orange,
        ),
      );
      return;
    }

    try {
      setState(() => _isLoading = true);
      
      final order = await DeliveryOrderService.createOrder(
        orderType: _selectedType,
        storeId: _selectedStore!.storeId,
        items: _selectedItems,
        pickupAddress: _pickupAddress,
        pickupLatitude: _pickupLatitude!,
        pickupLongitude: _pickupLongitude!,
        deliveryAddress: _deliveryAddress,
        deliveryLatitude: _deliveryLatitude!,
        deliveryLongitude: _deliveryLongitude!,
        customerNotes: _notesController.text.trim().isEmpty ? null : _notesController.text.trim(),
      );

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Pedido criado com sucesso!'),
          backgroundColor: Colors.green,
        ),
      );

      Navigator.of(context).pop(true);
    } catch (e) {
      setState(() => _isLoading = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Erro ao criar pedido: $e'),
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
          'Fazer Pedido de Delivery',
          style: GoogleFonts.poppins(
            fontWeight: FontWeight.w600,
          ),
        ),
        backgroundColor: Colors.green[800],
        foregroundColor: Colors.white,
        elevation: 0,
      ),
      body: _buildBody(),
      bottomNavigationBar: _buildBottomBar(),
    );
  }

  Widget _buildBody() {
    return Form(
      key: _formKey,
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Tipo de pedido
            _buildTypeSelector(),
            const SizedBox(height: 24),
            
            // Seleção de loja
            _buildStoreSelector(),
            const SizedBox(height: 24),
            
            // Produtos
            if (_selectedStore != null) ...[
              _buildProductsSection(),
              const SizedBox(height: 24),
            ],
            
            // Endereço de entrega
            _buildDeliveryAddressSection(),
            const SizedBox(height: 24),
            
            // Observações
            _buildNotesSection(),
            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }

  Widget _buildTypeSelector() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Tipo de Pedido',
          style: GoogleFonts.poppins(
            fontSize: 16,
            fontWeight: FontWeight.w600,
            color: Colors.grey[800],
          ),
        ),
        const SizedBox(height: 12),
        Row(
          children: DeliveryOrderType.values.map((type) {
            final isSelected = _selectedType == type;
            return Expanded(
              child: GestureDetector(
                onTap: () => _onTypeChanged(type),
                child: Container(
                  margin: const EdgeInsets.only(right: 8),
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  decoration: BoxDecoration(
                    color: isSelected ? Colors.green[800] : Colors.grey[200],
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Column(
                    children: [
                      Text(
                        type.icon,
                        style: const TextStyle(fontSize: 24),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        type.displayName,
                        style: GoogleFonts.poppins(
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                          color: isSelected ? Colors.white : Colors.grey[700],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          }).toList(),
        ),
      ],
    );
  }

  Widget _buildStoreSelector() {
    if (_isLoadingStores) {
      return const Center(
        child: CircularProgressIndicator(),
      );
    }

    if (_error != null) {
      return Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.red[50],
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          children: [
            Icon(Icons.error, color: Colors.red[700]),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                _error!,
                style: GoogleFonts.poppins(
                  color: Colors.red[700],
                  fontSize: 14,
                ),
              ),
            ),
            IconButton(
              onPressed: _loadAvailableStores,
              icon: const Icon(Icons.refresh),
              color: Colors.red[700],
            ),
          ],
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Loja',
          style: GoogleFonts.poppins(
            fontSize: 16,
            fontWeight: FontWeight.w600,
            color: Colors.grey[800],
          ),
        ),
        const SizedBox(height: 12),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            border: Border.all(color: Colors.grey[300]!),
            borderRadius: BorderRadius.circular(8),
          ),
          child: DropdownButtonHideUnderline(
            child: DropdownButton<Product>(
              value: _selectedStore,
              hint: Text(
                'Selecione uma loja',
                style: GoogleFonts.poppins(color: Colors.grey[600]),
              ),
              isExpanded: true,
              items: _availableProducts.map((store) {
                return DropdownMenuItem<Product>(
                  value: store,
                  child: Text(
                    store.storeName,
                    style: GoogleFonts.poppins(),
                  ),
                );
              }).toList(),
              onChanged: (store) => _onStoreChanged(store!),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildProductsSection() {
    if (_isLoadingProducts) {
      return const Center(
        child: CircularProgressIndicator(),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              'Produtos',
              style: GoogleFonts.poppins(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: Colors.grey[800],
              ),
            ),
            if (_selectedItems.isNotEmpty)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.green[100],
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  '${_selectedItems.length} itens',
                  style: GoogleFonts.poppins(
                    fontSize: 12,
                    color: Colors.green[800],
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 12),
        
        // Lista de produtos disponíveis
        ..._availableProducts.map((product) {
          return _ProductCard(product: product);
        }),
        
        // Itens selecionados
        if (_selectedItems.isNotEmpty) ...[
          const SizedBox(height: 24),
          Text(
            'Itens Selecionados',
            style: GoogleFonts.poppins(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              color: Colors.grey[800],
            ),
          ),
          const SizedBox(height: 12),
          ..._selectedItems.asMap().entries.map((entry) {
            return _SelectedItemCard(
              index: entry.key,
              item: entry.value,
            );
          }),
        ],
      ],
    );
  }

  Widget _ProductCard({required Product product}) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            // Foto do produto
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
            
            const SizedBox(width: 16),
            
            // Informações do produto
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
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
                  Text(
                    product.formattedPrice,
                    style: GoogleFonts.poppins(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: Colors.green[700],
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    product.stockStatus,
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      color: product.isOutOfStock 
                          ? Colors.red 
                          : product.isLowStock 
                              ? Colors.orange 
                              : Colors.green,
                    ),
                  ),
                ],
              ),
            ),
            
            // Botão de adicionar
            if (product.isAvailable)
              IconButton(
                onPressed: () => _addProduct(product, 1),
                icon: Icon(
                  Icons.add_circle,
                  color: Colors.green[700],
                  size: 32,
                ),
              )
            else
              Icon(
                Icons.block,
                color: Colors.grey[400],
                size: 32,
              ),
          ],
        ),
      ),
    );
  }

  Widget _SelectedItemCard({required int index, required OrderItem item}) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            // Quantidade
            Container(
              decoration: BoxDecoration(
                border: Border.all(color: Colors.grey[300]!),
                borderRadius: BorderRadius.circular(4),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  IconButton(
                    onPressed: item.quantity > 1 
                        ? () {
                            setState(() {
                              _selectedItems[index] = OrderItem(
                                productId: item.productId,
                                name: item.name,
                                price: item.price,
                                quantity: item.quantity - 1,
                                total: item.price * (item.quantity - 1),
                              );
                            });
                          }
                        : null,
                    icon: const Icon(Icons.remove, size: 16),
                  ),
                  Container(
                    width: 40,
                    alignment: Alignment.center,
                    child: Text(
                      '${item.quantity}',
                      style: GoogleFonts.poppins(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: () {
                      setState(() {
                        _selectedItems[index] = OrderItem(
                          productId: item.productId,
                          name: item.name,
                          price: item.price,
                          quantity: item.quantity + 1,
                          total: item.price * (item.quantity + 1),
                        );
                      });
                    },
                    icon: const Icon(Icons.add, size: 16),
                  ),
                ],
              ),
            ),
            
            const SizedBox(width: 16),
            
            // Nome e preço
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.name,
                    style: GoogleFonts.poppins(
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  Text(
                    'R\$ ${item.total.toStringAsFixed(2).replaceAll('.', ',')}',
                    style: GoogleFonts.poppins(
                      fontSize: 14,
                      fontWeight: FontWeight.bold,
                      color: Colors.green[700],
                    ),
                  ),
                ],
              ),
            ),
            
            // Botão de remover
            IconButton(
              onPressed: () => _removeProduct(index),
              icon: Icon(
                Icons.delete_outline,
                color: Colors.red[400],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDeliveryAddressSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Endereço de Entrega',
          style: GoogleFonts.poppins(
            fontSize: 16,
            fontWeight: FontWeight.w600,
            color: Colors.grey[800],
          ),
        ),
        const SizedBox(height: 12),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.grey[50],
            borderRadius: BorderRadius.circular(8),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(
                    Icons.location_on,
                    color: Colors.grey[600],
                    size: 20,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      _deliveryAddress,
                      style: GoogleFonts.poppins(
                        fontSize: 14,
                        color: Colors.grey[700],
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: () {
                      // TODO: Implementar seleção de endereço
                    },
                    icon: Icon(
                      Icons.edit,
                      color: Colors.grey[600],
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildNotesSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Observações (opcional)',
          style: GoogleFonts.poppins(
            fontSize: 16,
            fontWeight: FontWeight.w600,
            color: Colors.grey[800],
          ),
        ),
        const SizedBox(height: 12),
        TextFormField(
          controller: _notesController,
          maxLines: 3,
          decoration: InputDecoration(
            hintText: 'Alguma observação para o motoboy...',
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildBottomBar() {
    if (_selectedItems.isEmpty) return const SizedBox.shrink();
    
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.1),
            blurRadius: 10,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Resumo do pedido
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Subtotal:',
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  color: Colors.grey[600],
                ),
              ),
              Text(
                'R\$ ${_itemsTotal.toStringAsFixed(2).replaceAll('.', ',')}',
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Taxa de delivery:',
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  color: Colors.grey[600],
                ),
              ),
              Text(
                'R\$ ${_deliveryFee.toStringAsFixed(2).replaceAll('.', ',')}',
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          const Divider(),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Total:',
                style: GoogleFonts.poppins(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: Colors.grey[800],
                ),
              ),
              Text(
                'R\$ ${_totalAmount.toStringAsFixed(2).replaceAll('.', ',')}',
                style: GoogleFonts.poppins(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                  color: Colors.green[700],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          // Botão de submit
          SizedBox(
            width: double.infinity,
            height: 50,
            child: ElevatedButton(
              onPressed: _isLoading ? null : _submitOrder,
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.green[800],
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
              child: _isLoading
                  ? const CircularProgressIndicator(color: Colors.white)
                  : Text(
                      'Fazer Pedido',
                      style: GoogleFonts.poppins(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}
