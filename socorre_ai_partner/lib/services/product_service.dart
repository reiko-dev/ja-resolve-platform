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

  // Listar produtos da loja do parceiro
  static Future<List<Product>> getStoreProducts({ProductCategory? category}) async {
    try {
      final headers = await _authHeaders;
      
      String url = '$baseUrl/api/products/store';
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

  // Criar novo produto
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

  // Atualizar produto
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

  // Atualizar estoque
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

  // Ativar/desativar produto
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

  // Destacar produto
  static Future<void> toggleFeatured(String productId) async {
    try {
      final headers = await _authHeaders;
      
      await http.patch(
        Uri.parse('$baseUrl/api/products/$productId/featured'),
        headers: headers,
      );
    } catch (e) {
      throw Exception('Erro ao destacar produto: $e');
    }
  }

  // Deletar produto
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

  // Buscar produtos por SKU
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

  // Obter estatísticas dos produtos da loja
  static Future<Map<String, dynamic>> getStoreStats() async {
    try {
      final headers = await _authHeaders;
      
      final response = await http.get(
        Uri.parse('$baseUrl/api/products/store/stats'),
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

  // Buscar produtos com baixo estoque
  static Future<List<Product>> getLowStockProducts() async {
    try {
      final headers = await _authHeaders;
      
      final response = await http.get(
        Uri.parse('$baseUrl/api/products/store/low-stock'),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final productsList = data['data'] as List;
        return productsList.map((product) => Product.fromJson(product)).toList();
      } else {
        throw Exception('Falha ao buscar produtos com baixo estoque: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao buscar produtos com baixo estoque: $e');
    }
  }

  // Importar produtos em lote
  static Future<List<Product>> importProducts(List<Map<String, dynamic>> productsData) async {
    try {
      final headers = await _authHeaders;
      
      final response = await http.post(
        Uri.parse('$baseUrl/api/products/import'),
        headers: headers,
        body: jsonEncode({'products': productsData}),
      );

      if (response.statusCode == 201) {
        final data = jsonDecode(response.body);
        final productsList = data['data'] as List;
        return productsList.map((product) => Product.fromJson(product)).toList();
      } else {
        throw Exception('Falha ao importar produtos: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao importar produtos: $e');
    }
  }

  // Exportar produtos
  static Future<List<Map<String, dynamic>>> exportProducts() async {
    try {
      final headers = await _authHeaders;
      
      final response = await http.get(
        Uri.parse('$baseUrl/api/products/export'),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final productsList = data['data'] as List;
        return productsList.cast<Map<String, dynamic>>();
      } else {
        throw Exception('Falha ao exportar produtos: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao exportar produtos: $e');
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
      return 'O preço não pode ser maior que R\$ 10.000,00';
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

  // Buscar produtos por categoria na loja
  static Future<List<Product>> getProductsByCategory(ProductCategory category) async {
    try {
      final headers = await _authHeaders;
      
      final response = await http.get(
        Uri.parse('$baseUrl/api/products/store/category/${category.toString().split('.').last}'),
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

  // Buscar produtos em destaque da loja
  static Future<List<Product>> getFeaturedProducts() async {
    try {
      final headers = await _authHeaders;
      
      final response = await http.get(
        Uri.parse('$baseUrl/api/products/store/featured'),
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
}
