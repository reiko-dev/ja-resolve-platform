import 'dart:async';
import 'package:flutter/rendering.dart';
import 'package:geolocator/geolocator.dart';
import 'package:geocoding/geocoding.dart';
import 'package:permission_handler/permission_handler.dart';
import 'websocket_service.dart';

class LocationService {
  static StreamSubscription<Position>? _positionStream;
  static Position? _currentPosition;
  static String _currentAddress = "Obtendo localização...";
  static bool _isTracking = false;
  static String? _currentEmergencyId;

  static Position? get currentPosition => _currentPosition;
  static String get currentAddress => _currentAddress;
  static bool get isTracking => _isTracking;

  static Future<bool> requestLocationPermission() async {
    final status = await Permission.location.request();
    return status == PermissionStatus.granted;
  }

  static Future<bool> checkLocationPermission() async {
    final status = await Permission.location.status;
    return status == PermissionStatus.granted;
  }

  static Future<void> initialize() async {
    final hasPermission = await checkLocationPermission();
    if (!hasPermission) {
      await requestLocationPermission();
    }
  }

  static Future<void> startTracking({String? emergencyId}) async {
    if (_isTracking) return;

    final hasPermission = await checkLocationPermission();
    if (!hasPermission) {
      throw Exception('Permissão de localização negada');
    }

    _currentEmergencyId = emergencyId;
    _isTracking = true;

    const LocationSettings locationSettings = LocationSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: 10, // Atualizar a cada 10 metros
    );

    _positionStream = Geolocator.getPositionStream(
      locationSettings: locationSettings,
    ).listen(
      (Position position) {
        _currentPosition = position;
        _updateAddress(position);
        _sendLocationUpdate(position);
      },
      onError: (error) {
        debugPrint('Erro na localização: $error');
        _isTracking = false;
      },
    );
  }

  static Future<void> stopTracking() async {
    if (!_isTracking) return;

    await _positionStream?.cancel();
    _positionStream = null;
    _isTracking = false;
    _currentEmergencyId = null;
  }

  static Future<void> _updateAddress(Position position) async {
    try {
      final placemarks = await placemarkFromCoordinates(
        position.latitude,
        position.longitude,
      );

      if (placemarks.isNotEmpty) {
        final place = placemarks[0];
        _currentAddress = '${place.street}, ${place.locality}';
      }
    } catch (e) {
      debugPrint('Erro ao obter endereço: $e');
      _currentAddress = "Endereço não disponível";
    }
  }

  static void _sendLocationUpdate(Position position) {
    if (WebSocketService.isConnected) {
      WebSocketService.updateLocation(
        latitude: position.latitude,
        longitude: position.longitude,
        emergencyRequestId: _currentEmergencyId,
      );
    }
  }

  static Future<Position?> getCurrentPosition() async {
    try {
      final hasPermission = await checkLocationPermission();
      if (!hasPermission) {
        throw Exception('Permissão de localização negada');
      }

      final position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      );

      _currentPosition = position;
      await _updateAddress(position);
      
      return position;
    } catch (e) {
      debugPrint('Erro ao obter posição atual: $e');
      return null;
    }
  }

  static double calculateDistance(
    double lat1, double lon1, double lat2, double lon2) {
    return Geolocator.distanceBetween(lat1, lon1, lat2, lon2);
  }

  static Future<String> getAddressFromCoordinates(
    double latitude, double longitude) async {
    try {
      final placemarks = await placemarkFromCoordinates(latitude, longitude);
      if (placemarks.isNotEmpty) {
        final place = placemarks[0];
        return '${place.street}, ${place.locality}';
      }
      return "Endereço não encontrado";
    } catch (e) {
      debugPrint('Erro ao obter endereço: $e');
      return "Endereço não disponível";
    }
  }

  static void dispose() {
    stopTracking();
  }
}