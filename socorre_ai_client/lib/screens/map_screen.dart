import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:geolocator/geolocator.dart';
import '../models/partner.dart';

class MapScreen extends StatefulWidget {
  final double? initialLatitude;
  final double? initialLongitude;
  final List<Partner>? partners;

  const MapScreen({
    super.key,
    this.initialLatitude,
    this.initialLongitude,
    this.partners,
  });

  @override
  State<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends State<MapScreen> {
  GoogleMapController? _mapController;
  LatLng? _currentPosition;
  Set<Marker> _markers = {};
  bool _isLoading = true;
  String _error = '';

  @override
  void initState() {
    super.initState();
    _initializeMap();
  }

  Future<void> _initializeMap() async {
    try {
      // Obter localização atual
      final position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      );
      
      setState(() {
        _currentPosition = LatLng(position.latitude, position.longitude);
        _isLoading = false;
      });

      // Adicionar marcadores dos parceiros
      _addPartnerMarkers();
      
    } catch (e) {
      setState(() {
        _error = 'Erro ao obter localização: $e';
        _isLoading = false;
      });
    }
  }

  void _addPartnerMarkers() {
    if (widget.partners == null) return;

    final markers = <Marker>{};
    
    for (int i = 0; i < widget.partners!.length; i++) {
      final partner = widget.partners![i];
      final lat = (partner.location['latitude'] as num?)?.toDouble();
      final lng = (partner.location['longitude'] as num?)?.toDouble();

      if (lat != null && lng != null) {
        markers.add(
          Marker(
            markerId: MarkerId('partner_$i'),
            position: LatLng(lat, lng),
            infoWindow: InfoWindow(
              title: partner.businessName,
              snippet: partner.description,
            ),
            icon: BitmapDescriptor.defaultMarkerWithHue(
              _getMarkerColor(partner.type),
            ),
          ),
        );
      }
    }

    setState(() {
      _markers = markers;
    });
  }

  double _getMarkerColor(PartnerType type) {
    switch (type) {
      case PartnerType.mechanic:
        return BitmapDescriptor.hueRed;
      case PartnerType.towTruck:
        return BitmapDescriptor.hueBlue;
      case PartnerType.general:
        return BitmapDescriptor.hueGreen;
      case PartnerType.battery:
        return BitmapDescriptor.hueAzure;
      case PartnerType.fuel:
        return BitmapDescriptor.hueViolet;
      case PartnerType.tire:
        return BitmapDescriptor.hueCyan;
      default:
        return BitmapDescriptor.hueOrange;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Mapa de Parceiros',
          style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
        ),
        backgroundColor: const Color(0xFF2B6CB0),
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            icon: const Icon(Icons.my_location),
            onPressed: _goToCurrentLocation,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(
              child: CircularProgressIndicator(
                valueColor: AlwaysStoppedAnimation<Color>(Color(0xFFE53E3E)),
              ),
            )
          : _error.isNotEmpty
              ? _buildErrorWidget()
              : _currentPosition == null
                  ? _buildNoLocationWidget()
                  : _buildMap(),
      floatingActionButton: FloatingActionButton(
        onPressed: _goToCurrentLocation,
        backgroundColor: const Color(0xFFE53E3E),
        child: const Icon(Icons.my_location, color: Colors.white),
      ),
    );
  }

  Widget _buildMap() {
    return Stack(
      children: [
        GoogleMap(
          initialCameraPosition: CameraPosition(
            target: _currentPosition!,
            zoom: 15.0,
          ),
          onMapCreated: (GoogleMapController controller) {
            _mapController = controller;
          },
          markers: _markers,
          myLocationEnabled: true,
          myLocationButtonEnabled: false,
          mapType: MapType.normal,
          onTap: (LatLng position) {
            // Adicionar marcador ao tocar no mapa
            _addMarkerAtPosition(position);
          },
        ),
        // Legenda
        Positioned(
          top: 16,
          right: 16,
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(8),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.1),
                  blurRadius: 4,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'Legenda',
                  style: GoogleFonts.poppins(
                    fontWeight: FontWeight.bold,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 8),
                _buildLegendItem('🔴', 'Mecânicos'),
                _buildLegendItem('🔵', 'Motoboys'),
                _buildLegendItem('🟢', 'Lojas'),
              ],
            ),
          ),
        ),
        // Contador de parceiros
        Positioned(
          bottom: 16,
          left: 16,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: const Color(0xFFE53E3E),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(
              '${_markers.length} parceiros próximos',
              style: GoogleFonts.poppins(
                color: Colors.white,
                fontWeight: FontWeight.w600,
                fontSize: 12,
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildLegendItem(String icon, String label) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(icon, style: const TextStyle(fontSize: 16)),
          const SizedBox(width: 8),
          Text(
            label,
            style: GoogleFonts.poppins(fontSize: 12),
          ),
        ],
      ),
    );
  }

  Widget _buildErrorWidget() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.error_outline,
            size: 64,
            color: Colors.grey[400],
          ),
          const SizedBox(height: 16),
          Text(
            'Erro ao carregar mapa',
            style: GoogleFonts.poppins(
              fontSize: 18,
              color: Colors.grey[600],
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            _error,
            style: GoogleFonts.poppins(
              fontSize: 14,
              color: Colors.grey[500],
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: _initializeMap,
            child: const Text('Tentar novamente'),
          ),
        ],
      ),
    );
  }

  Widget _buildNoLocationWidget() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.location_off,
            size: 64,
            color: Colors.grey[400],
          ),
          const SizedBox(height: 16),
          Text(
            'Localização não disponível',
            style: GoogleFonts.poppins(
              fontSize: 18,
              color: Colors.grey[600],
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Ative a localização para ver o mapa',
            style: GoogleFonts.poppins(
              fontSize: 14,
              color: Colors.grey[500],
            ),
          ),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: _initializeMap,
            child: const Text('Ativar localização'),
          ),
        ],
      ),
    );
  }

  Future<void> _goToCurrentLocation() async {
    if (_mapController == null) return;

    try {
      final position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      );
      
      _mapController!.animateCamera(
        CameraUpdate.newLatLng(
          LatLng(position.latitude, position.longitude),
        ),
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Erro ao obter localização: $e')),
      );
    }
  }

  void _addMarkerAtPosition(LatLng position) {
    setState(() {
      _markers.add(
        Marker(
          markerId: MarkerId('custom_${_markers.length}'),
          position: position,
          infoWindow: const InfoWindow(
            title: 'Localização selecionada',
            snippet: 'Toque para remover',
          ),
          icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueViolet),
        ),
      );
    });
  }
}
