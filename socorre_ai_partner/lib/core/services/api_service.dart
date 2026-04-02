import 'dart:convert';
import 'package:dio/dio.dart';
import '../constants/app_constants.dart';

class ApiService {
  late final Dio _dio;
  
  ApiService() {
    _dio = Dio(BaseOptions(
      baseUrl: AppConstants.apiBaseUrl,
      connectTimeout: const Duration(seconds: 30),
      receiveTimeout: const Duration(seconds: 30),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    ));
    
    // Interceptors
    _dio.interceptors.add(LogInterceptor(
      requestBody: true,
      responseBody: true,
      logPrint: (object) {
        if (AppConstants.isDebugMode) {
          print(object);
        }
      },
    ));
    
    _dio.interceptors.add(AuthInterceptor());
  }
  
  // GET request
  Future<ApiResult<T>> get<T>(
    String endpoint, {
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) async {
    try {
      final response = await _dio.get<T>(
        endpoint,
        queryParameters: queryParameters,
        options: options,
      );
      
      return ApiResult.success(response.data);
    } on DioException catch (e) {
      return ApiResult.error(_handleDioError(e));
    } catch (e) {
      return ApiResult.error('Erro inesperado: $e');
    }
  }
  
  // POST request
  Future<ApiResult<T>> post<T>(
    String endpoint, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) async {
    try {
      final response = await _dio.post<T>(
        endpoint,
        data: data,
        queryParameters: queryParameters,
        options: options,
      );
      
      return ApiResult.success(response.data);
    } on DioException catch (e) {
      return ApiResult.error(_handleDioError(e));
    } catch (e) {
      return ApiResult.error('Erro inesperado: $e');
    }
  }
  
  // PUT request
  Future<ApiResult<T>> put<T>(
    String endpoint, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) async {
    try {
      final response = await _dio.put<T>(
        endpoint,
        data: data,
        queryParameters: queryParameters,
        options: options,
      );
      
      return ApiResult.success(response.data);
    } on DioException catch (e) {
      return ApiResult.error(_handleDioError(e));
    } catch (e) {
      return ApiResult.error('Erro inesperado: $e');
    }
  }
  
  // DELETE request
  Future<ApiResult<T>> delete<T>(
    String endpoint, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) async {
    try {
      final response = await _dio.delete<T>(
        endpoint,
        data: data,
        queryParameters: queryParameters,
        options: options,
      );
      
      return ApiResult.success(response.data);
    } on DioException catch (e) {
      return ApiResult.error(_handleDioError(e));
    } catch (e) {
      return ApiResult.error('Erro inesperado: $e');
    }
  }
  
  // Upload file
  Future<ApiResult<T>> uploadFile<T>(
    String endpoint,
    String filePath, {
    Map<String, dynamic>? additionalFields,
    ProgressCallback? onSendProgress,
  }) async {
    try {
      final formData = FormData.fromMap({
        'file': await MultipartFile.fromFile(filePath),
        ...?additionalFields,
      });
      
      final response = await _dio.post<T>(
        endpoint,
        data: formData,
        onSendProgress: onSendProgress,
      );
      
      return ApiResult.success(response.data);
    } on DioException catch (e) {
      return ApiResult.error(_handleDioError(e));
    } catch (e) {
      return ApiResult.error('Erro inesperado: $e');
    }
  }
  
  // Handle Dio errors
  String _handleDioError(DioException error) {
    switch (error.type) {
      case DioExceptionType.connectionTimeout:
        return 'Tempo de conexão esgotado';
      case DioExceptionType.sendTimeout:
        return 'Tempo de envio esgotado';
      case DioExceptionType.receiveTimeout:
        return 'Tempo de resposta esgotado';
      case DioExceptionType.badResponse:
        return _handleHttpError(error.response?.statusCode ?? 0, error.response?.data);
      case DioExceptionType.cancel:
        return 'Requisição cancelada';
      case DioExceptionType.connectionError:
        return 'Erro de conexão';
      case DioExceptionType.badCertificate:
        return 'Erro de certificado SSL';
      case DioExceptionType.unknown:
        return 'Erro desconhecido: ${error.message}';
    }
  }
  
  String _handleHttpError(int statusCode, dynamic data) {
    switch (statusCode) {
      case 400:
        return data?['message'] ?? 'Requisição inválida';
      case 401:
        return 'Não autorizado';
      case 403:
        return 'Acesso negado';
      case 404:
        return 'Recurso não encontrado';
      case 422:
        return data?['message'] ?? 'Dados inválidos';
      case 429:
        return 'Muitas tentativas. Tente novamente mais tarde';
      case 500:
        return 'Erro interno do servidor';
      case 502:
        return 'Serviço indisponível';
      case 503:
        return 'Serviço em manutenção';
      default:
        return data?['message'] ?? 'Erro HTTP: $statusCode';
    }
  }
}

// Result wrapper
class ApiResult<T> {
  final bool success;
  final T? data;
  final String? error;
  
  ApiResult.success(this.data) : success = true, error = null;
  ApiResult.error(this.error) : success = false, data = null;
}

// Auth interceptor
class AuthInterceptor extends Interceptor {
  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    // TODO: Adicionar token de autenticação
    // final token = StorageService.getToken();
    // if (token != null) {
    //   options.headers['Authorization'] = 'Bearer $token';
    // }
    super.onRequest(options, handler);
  }
  
  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    // TODO: Handle 401 errors (token expired)
    // if (err.response?.statusCode == 401) {
    //   // Refresh token or logout
    // }
    super.onError(err, handler);
  }
}
