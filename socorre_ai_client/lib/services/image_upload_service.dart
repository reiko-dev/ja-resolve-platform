import 'dart:io';
import 'dart:convert';
import 'dart:typed_data';
import 'package:http/http.dart' as http;
import 'package:mime/mime.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../config/app_config.dart';

class ImageUploadService {
  static String get baseUrl => AppConfig.baseUrl;
  static String get _uploadUrl => '$baseUrl/upload/images';
  static const int _maxFileSizeMB = 5; // Max 5MB por imagem

  static bool isValidImage(File image) {
    final mimeType = lookupMimeType(image.path);
    return mimeType != null && mimeType.startsWith('image/');
  }

  static Future<bool> isValidFileSize(File image) async {
    final fileSize = await image.length(); // in bytes
    return fileSize <= (_maxFileSizeMB * 1024 * 1024);
  }

  static Future<List<String>> uploadImages(List<File> images) async {
    if (images.isEmpty) {
      return [];
    }

    try {
      final prefs = await SharedPreferences.getInstance();
      final userToken = prefs.getString('auth_token');
      
      if (userToken == null) {
        throw Exception('Usuário não autenticado');
      }

      // Converter imagens para base64
      final List<Map<String, String>> imageDataList = [];
      
      for (final image in images) {
        if (!isValidImage(image)) {
          throw Exception('Tipo de arquivo não suportado: ${image.path}');
        }

        if (!await isValidFileSize(image)) {
          throw Exception('Arquivo muito grande: ${image.path}');
        }

        final bytes = await image.readAsBytes();
        final base64Image = base64Encode(bytes);
        final mimeType = lookupMimeType(image.path) ?? 'image/jpeg';
        final filename = image.path.split('/').last;

        imageDataList.add({
          'image': 'data:$mimeType;base64,$base64Image',
          'filename': filename,
          'mimeType': mimeType,
        });
      }

      final response = await http.post(
        Uri.parse(_uploadUrl),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $userToken',
        },
        body: jsonEncode({
          'images': imageDataList,
        }),
      );

      print('📤 Upload URL: $_uploadUrl');
      print('📥 Response status: ${response.statusCode}');
      print('📥 Response body: ${response.body.substring(0, response.body.length > 500 ? 500 : response.body.length)}');

      if (response.statusCode == 200 || response.statusCode == 201) {
        final data = jsonDecode(response.body);
        if (data['success'] && data['data']['urls'] is List) {
          return List<String>.from(data['data']['urls']);
        } else {
          throw Exception(data['message'] ?? 'Erro desconhecido no upload');
        }
      } else {
        String errorMessage = 'Falha no upload de imagens: ${response.statusCode}';
        try {
          final errorData = jsonDecode(response.body);
          errorMessage = errorData['message'] ?? errorMessage;
        } catch (_) {
          errorMessage = 'Rota não encontrada no backend da API';
        }
        throw Exception(errorMessage);
      }
    } catch (e) {
      print('❌ Erro no upload de imagens: $e');
      rethrow;
    }
  }

  static Future<String> uploadSingleImage(File image) async {
    final urls = await uploadImages([image]);
    if (urls.isEmpty) {
      throw Exception('Falha no upload da imagem');
    }
    return urls.first;
  }

  static Future<Uint8List> compressImage(File image, {int quality = 85}) async {
    // Implementação básica de compressão
    // Em produção, usar um pacote como flutter_image_compress
    return await image.readAsBytes();
  }

  static Future<List<File>> pickImages() async {
    // Esta função seria implementada com image_picker
    // Por enquanto, retorna lista vazia
    return [];
  }

  static String getImageUrl(String filename) {
    return '$baseUrl/api/upload/images/$filename';
  }
}
