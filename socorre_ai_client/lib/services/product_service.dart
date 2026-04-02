import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/product.dart';
import '../config/app_config.dart';
import 'auth_service.dart';

class ProductService {
  static String get baseUrl => AppConfig.baseUrl;

  // Headers com autenticação
  static Future<Map<String, String>> get _authHeaders async {
    final token = await AuthService.getToken();
    return {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $token',
    };
  }

  // Listar produtos
  static Future<List<Product>> getProducts({
    ProductCategory? category,
    ProductType? type,
    String? search,
    bool? featured,
    bool? active,
    int page = 1,
    int limit = 20,
  }) async {
    try {
      final headers = await _authHeaders;
      
      String url = '$baseUrl/api/products?page=$page&limit=$limit';
      
      if (category != null) {
        url += '&category=${category.toString().split('.').last}';
      }
      
      if (type != null) {
        url += '&type=${type.toString().split('.').last}';
      }
      
      if (search != null && search.isNotEmpty) {
        url += '&search=${Uri.encodeComponent(search)}';
      }
      
      if (featured != null) {
        url += '&featured=$featured';
      }
      
      if (active != null) {
        url += '&active=$active';
      }

      final response = await http.get(
        Uri.parse(url),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final productsList = data['data']['products'] as List;
        return productsList.map((product) => Product.fromJson(product)).toList();
      } else {
        throw Exception('Falha ao buscar produtos: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao buscar produtos: $e');
    }
  }

  // Buscar produto por ID
  static Future<Product?> getProductById(String productId) async {
    try {
      final headers = await _authHeaders;
      
      final response = await http.get(
        Uri.parse('$baseUrl/api/products/$productId'),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return Product.fromJson(data['data']);
      } else if (response.statusCode == 404) {
        return null;
      } else {
        throw Exception('Falha ao buscar produto: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao buscar produto: $e');
    }
  }

  // Buscar produto por SKU
  static Future<Product?> getProductBySku(String sku) async {
    try {
      final headers = await _authHeaders;
      
      final response = await http.get(
        Uri.parse('$baseUrl/api/products/sku/$sku'),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return Product.fromJson(data['data']);
      } else if (response.statusCode == 404) {
        return null;
      } else {
        throw Exception('Falha ao buscar produto por SKU: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao buscar produto por SKU: $e');
    }
  }

  // Buscar produtos da loja
  static Future<List<Product>> getStoreProducts(String storeId, {ProductCategory? category}) async {
    try {
      final headers = await _authHeaders;
      
      String url = '$baseUrl/api/products/store/$storeId';
      if (category != null) {
        url += '?category=${category.toString().split('.').last}';
      }

      final response = await http.get(
        Uri.parse(url),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final productsList = data['data'] as List;
        return productsList.map((product) => Product.fromJson(product)).toList();
      } else {
        throw Exception('Falha ao buscar produtos da loja: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao buscar produtos da loja: $e');
    }
  }

  // Buscar produtos por categoria
  static Future<List<Product>> getProductsByCategory(ProductCategory category) async {
    try {
      final headers = await _authHeaders;
      
      final response = await http.get(
        Uri.parse('$baseUrl/api/products/category/${category.toString().split('.').last}'),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final productsList = data['data'] as List;
        return productsList.map((product) => Product.fromJson(product)).toList();
      } else {
        throw Exception('Falha ao buscar produtos por categoria: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao buscar produtos por categoria: $e');
    }
  }

  // Buscar combustíveis
  static Future<List<Product>> getFuels() async {
    try {
      final headers = await _authHeaders;
      
      final response = await http.get(
        Uri.parse('$baseUrl/api/products/fuels'),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final productsList = data['data'] as List;
        return productsList.map((product) => Product.fromJson(product)).toList();
      } else {
        throw Exception('Falha ao buscar combustíveis: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao buscar combustíveis: $e');
    }
  }

  // Buscar auto peças
  static Future<List<Product>> getAutoParts() async {
    try {
      final headers = await _authHeaders;
      
      final response = await http.get(
        Uri.parse('$baseUrl/api/products/auto-parts'),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final productsList = data['data'] as List;
        return productsList.map((product) => Product.fromJson(product)).toList();
      } else {
        throw Exception('Falha ao buscar auto peças: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao buscar auto peças: $e');
    }
  }

  // Buscar produtos em destaque
  static Future<List<Product>> getFeaturedProducts() async {
    try {
      final headers = await _authHeaders;
      
      final response = await http.get(
        Uri.parse('$baseUrl/api/products/featured'),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final productsList = data['data'] as List;
        return productsList.map((product) => Product.fromJson(product)).toList();
      } else {
        throw Exception('Falha ao buscar produtos em destaque: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao buscar produtos em destaque: $e');
    }
  }

  // Buscar produtos similares
  static Future<List<Product>> getSimilarProducts(String productId) async {
    try {
      final headers = await _authHeaders;
      
      final response = await http.get(
        Uri.parse('$baseUrl/api/products/$productId/similar'),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final productsList = data['data'] as List;
        return productsList.map((product) => Product.fromJson(product)).toList();
      } else {
        throw Exception('Falha ao buscar produtos similares: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao buscar produtos similares: $e');
    }
  }

  // Busca textual
  static Future<List<Product>> searchProducts(String query, {ProductCategory? category}) async {
    try {
      final headers = await _authHeaders;
      
      String url = '$baseUrl/api/products/search?q=${Uri.encodeComponent(query)}';
      if (category != null) {
        url += '&category=${category.toString().split('.').last}';
      }

      final response = await http.get(
        Uri.parse(url),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final productsList = data['data'] as List;
        return productsList.map((product) => Product.fromJson(product)).toList();
      } else {
        throw Exception('Falha ao buscar produtos: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao buscar produtos: $e');
    }
  }

  // Verificar disponibilidade do produto
  static Future<Map<String, dynamic>> checkAvailability(String productId) async {
    try {
      final headers = await _authHeaders;
      
      final response = await http.get(
        Uri.parse('$baseUrl/api/products/$productId/availability'),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return data['data'];
      } else {
        throw Exception('Falha ao verificar disponibilidade: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao verificar disponibilidade: $e');
    }
  }

  // Obter estatísticas
  static Future<Map<String, dynamic>> getProductStats() async {
    try {
      final headers = await _authHeaders;
      
      final response = await http.get(
        Uri.parse('$baseUrl/api/products/stats'),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return data['data'];
      } else {
        throw Exception('Falha ao buscar estatísticas: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao buscar estatísticas: $e');
    }
  }

  // Métodos para parceiros (criar, atualizar produtos)
  static Future<Product> createProduct({
    required String name,
    required String description,
    required ProductCategory category,
    required ProductType type,
    required double price,
    required int stock,
    String? sku,
    String? unit,
    String? brand,
    List<String>? tags,
    List<String>? photos,
    Map<String, dynamic>? specifications,
  }) async {
    try {
      final headers = await _authHeaders;
      
      final body = {
        'name': name,
        'description': description,
        'category': category.toString().split('.').last,
        'type': type.toString().split('.').last,
        'price': price,
        'stock': stock,
        'sku': sku,
        'unit': unit,
        'brand': brand,
        'tags': tags,
        'photos': photos,
        'specifications': specifications,
      };

      final response = await http.post(
        Uri.parse('$baseUrl/api/products'),
        headers: headers,
        body: jsonEncode(body),
      );

      if (response.statusCode == 201) {
        final data = jsonDecode(response.body);
        return Product.fromJson(data['data']);
      } else {
        throw Exception('Falha ao criar produto: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao criar produto: $e');
    }
  }

  static Future<Product> updateProduct(String productId, {
    String? name,
    String? description,
    ProductCategory? category,
    ProductType? type,
    double? price,
    int? stock,
    String? unit,
    String? brand,
    List<String>? tags,
    List<String>? photos,
    Map<String, dynamic>? specifications,
  }) async {
    try {
      final headers = await _authHeaders;
      
      final body = {};
      if (name != null) body['name'] = name;
      if (description != null) body['description'] = description;
      if (category != null) body['category'] = category.toString().split('.').last;
      if (type != null) body['type'] = type.toString().split('.').last;
      if (price != null) body['price'] = price;
      if (stock != null) body['stock'] = stock;
      if (unit != null) body['unit'] = unit;
      if (brand != null) body['brand'] = brand;
      if (tags != null) body['tags'] = tags;
      if (photos != null) body['photos'] = photos;
      if (specifications != null) body['specifications'] = specifications;

      final response = await http.put(
        Uri.parse('$baseUrl/api/products/$productId'),
        headers: headers,
        body: jsonEncode(body),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return Product.fromJson(data['data']);
      } else {
        throw Exception('Falha ao atualizar produto: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao atualizar produto: $e');
    }
  }

  static Future<void> updateStock(String productId, int newStock) async {
    try {
      final headers = await _authHeaders;
      
      final body = {'stock': newStock};

      final response = await http.patch(
        Uri.parse('$baseUrl/api/products/$productId/stock'),
        headers: headers,
        body: jsonEncode(body),
      );

      if (response.statusCode != 200) {
        throw Exception('Falha ao atualizar estoque: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao atualizar estoque: $e');
    }
  }

  static Future<void> toggleActive(String productId) async {
    try {
      final headers = await _authHeaders;
      
      await http.patch(
        Uri.parse('$baseUrl/api/products/$productId/active'),
        headers: headers,
      );
    } catch (e) {
      throw Exception('Erro ao ativar/desativar produto: $e');
    }
  }

  static Future<void> deleteProduct(String productId) async {
    try {
      final headers = await _authHeaders;
      
      final response = await http.delete(
        Uri.parse('$baseUrl/api/products/$productId'),
        headers: headers,
      );

      if (response.statusCode != 200) {
        throw Exception('Falha ao deletar produto: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao deletar produto: $e');
    }
  }

  // Métodos utilitários
  static String? validateProduct({
    required String name,
    required String description,
    required double price,
    required int stock,
  }) {
    // Validar nome
    if (name.trim().isEmpty) {
      return 'O nome do produto é obrigatório';
    }
    
    if (name.length < 3) {
      return 'O nome deve ter pelo menos 3 caracteres';
    }

    // Validar descrição
    if (description.trim().isEmpty) {
      return 'A descrição do produto é obrigatória';
    }

    // Validar preço
    if (price <= 0) {
      return 'O preço deve ser maior que zero';
    }

    if (price > 10000) {
      return 'O preço não pode ser maior que R$ 10.000,00';
    }

    // Validar estoque
    if (stock < 0) {
      return 'O estoque não pode ser negativo';
    }

    if (stock > 10000) {
      return 'O estoque não pode ser maior que 10.000 unidades';
    }

    return null; // Válido
  }

  // Gerar SKU automático
  static String generateSku(String storeName, String productName) {
    final storeCode = storeName.replaceAll(RegExp(r'[^a-zA-Z0-9]'), '').toUpperCase().substring(0, 3);
    final productCode = productName.replaceAll(RegExp(r'[^a-zA-Z0-9]'), '').toUpperCase().substring(0, 6);
    final timestamp = DateTime.now().millisecondsSinceEpoch.toString().substring(-4);
    
    return '$storeCode-$productCode-$timestamp';
  }

  // Calcular preço com desconto
  static double calculateDiscountedPrice(double originalPrice, double discountPercent) {
    return originalPrice * (1 - discountPercent / 100);
  }

  // Verificar se produto está disponível para entrega
  static bool isAvailableForDelivery(Product product, int quantity) {
    return product.isAvailable && product.stock >= quantity;
  }
}
