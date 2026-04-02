import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:geolocator/geolocator.dart';
import 'package:geocoding/geocoding.dart';
import '../services/auth_service.dart';
import '../services/emergency_service.dart';
import '../services/partner_service.dart';
import '../models/emergency_request.dart';
import '../models/partner.dart';
import '../widgets/app_drawer.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  String _currentAddress = "Obtendo localização...";
  
  // Google Maps
  GoogleMapController? _mapController;
  LatLng _currentLocation = const LatLng(-23.5505, -46.6333); // São Paulo
  Set<Marker> _markers = {};
  bool _isMapReady = false;
  bool _isLoadingPartners = false;
  bool _isLoadingEmergencies = false;
  List<Partner> _nearbyPartners = [];
  List<EmergencyRequest> _recentEmergencies = [];

  @override
  void initState() {
    super.initState();
    _initializeMap();
  }

  Future<void> _initializeMap() async {
    try {
      // Verificar se a localização está habilitada
      bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        setState(() {
          _currentAddress = "Localização desabilitada";
        });
        return;
      }

      // Verificar permissões
      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
        if (permission == LocationPermission.denied) {
          setState(() {
            _currentAddress = "Permissão de localização negada";
          });
          return;
        }
      }

      if (permission == LocationPermission.deniedForever) {
        setState(() {
          _currentAddress = "Permissão de localização negada permanentemente";
        });
        return;
      }

      // Obter localização atual com timeout
      final position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      ).timeout(
        const Duration(seconds: 10),
        onTimeout: () {
          throw Exception('Timeout ao obter localização');
        },
      );
      
      setState(() {
        _currentLocation = LatLng(position.latitude, position.longitude);
      });

      // Obter endereço
      try {
        final placemarks = await placemarkFromCoordinates(
          position.latitude,
          position.longitude,
        );
        if (placemarks.isNotEmpty) {
          final place = placemarks.first;
          setState(() {
            _currentAddress = "${place.street ?? ''}, ${place.locality ?? ''}";
            if (_currentAddress.trim().isEmpty) {
              _currentAddress = "${place.subAdministrativeArea ?? ''}, ${place.administrativeArea ?? ''}";
            }
            if (_currentAddress.trim().isEmpty) {
              _currentAddress = "Localização obtida";
            }
          });
        }
      } catch (e) {
        print('Erro ao obter endereço: $e');
        setState(() {
          _currentAddress = "Localização obtida";
        });
      }

      // Buscar parceiros próximos
      _loadNearbyPartners(position.latitude, position.longitude);
      
      // Buscar emergências recentes
      _loadRecentEmergencies();
      
    } catch (e) {
      print('Erro ao obter localização: $e');
      setState(() {
        _currentAddress = "Erro ao obter localização";
      });
    }
  }

  Future<void> _loadNearbyPartners(double latitude, double longitude) async {
    setState(() {
      _isLoadingPartners = true;
    });

    try {
      final partners = await PartnerService.getNearbyPartners(
        latitude: latitude,
        longitude: longitude,
        radius: 15.0,
      );

      setState(() {
        _nearbyPartners = partners;
        _isLoadingPartners = false;
      });

      // Atualizar marcadores no mapa
      _updatePartnerMarkers();
    } catch (e) {
      print('Erro ao buscar parceiros: $e');
      setState(() {
        _isLoadingPartners = false;
      });
    }
  }

  Future<void> _loadRecentEmergencies() async {
    setState(() {
      _isLoadingEmergencies = true;
    });

    try {
      final emergencies = await EmergencyService.getUserRequests();
      
      // Ordenar por data mais recente e pegar as 3 primeiras
      emergencies.sort((a, b) => b.createdAt.compareTo(a.createdAt));
      
      setState(() {
        _recentEmergencies = emergencies.take(3).toList();
        _isLoadingEmergencies = false;
      });
    } catch (e) {
      print('Erro ao buscar emergências: $e');
      setState(() {
        _isLoadingEmergencies = false;
      });
    }
  }

  void _updatePartnerMarkers() {
    final markers = <Marker>{
      Marker(
        markerId: const MarkerId('user'),
        position: _currentLocation,
        icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueBlue),
        infoWindow: const InfoWindow(title: 'Você está aqui'),
      ),
    };

    for (int i = 0; i < _nearbyPartners.length; i++) {
      final partner = _nearbyPartners[i];
      final location = partner.location;
      final lat = location['latitude'];
      final lng = location['longitude'];

      if (lat != null && lng != null) {
        final distance = partner.distance != null 
            ? '${partner.distance!.toStringAsFixed(1)} km'
            : '';
        final status = partner.isAvailable ? 'Disponível' : 'Indisponível';

        markers.add(
          Marker(
            markerId: MarkerId('partner_$i'),
            position: LatLng(lat.toDouble(), lng.toDouble()),
            infoWindow: InfoWindow(
              title: partner.businessName,
              snippet: '$distance - $status',
            ),
            icon: BitmapDescriptor.defaultMarkerWithHue(
              partner.isAvailable 
                  ? BitmapDescriptor.hueGreen 
                  : BitmapDescriptor.hueRed,
            ),
          ),
        );
      }
    }

    setState(() {
      _markers = markers;
    });
  }


  Future<void> _centerMapOnUser() async {
    if (_mapController != null) {
      try {
        // Aguardar um pouco para o mapa estar totalmente carregado
        await Future.delayed(const Duration(milliseconds: 500));
        
        final position = await Geolocator.getCurrentPosition(
          desiredAccuracy: LocationAccuracy.high,
        );
        
        _mapController!.animateCamera(
          CameraUpdate.newLatLngZoom(
            LatLng(position.latitude, position.longitude),
            15.0,
          ),
        );
      } catch (e) {
        print('Erro ao centralizar mapa: $e');
      }
    }
  }

  Future<void> _refreshLocation() async {
    try {
      final position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      );
      
      setState(() {
        _currentLocation = LatLng(position.latitude, position.longitude);
      });

      // Obter endereço
      try {
        final placemarks = await placemarkFromCoordinates(
          position.latitude,
          position.longitude,
        );
        if (placemarks.isNotEmpty) {
          final place = placemarks.first;
          setState(() {
            _currentAddress = "${place.street ?? ''}, ${place.locality ?? ''}";
            if (_currentAddress.trim().isEmpty) {
              _currentAddress = "${place.subAdministrativeArea ?? ''}, ${place.administrativeArea ?? ''}";
            }
            if (_currentAddress.trim().isEmpty) {
              _currentAddress = "Localização obtida";
            }
          });
        }
      } catch (e) {
        print('Erro ao obter endereço: $e');
      }

      // Atualizar parceiros e mapa
      _loadNearbyPartners(position.latitude, position.longitude);
      _updatePartnerMarkers();
      
      if (_mapController != null) {
        _mapController!.animateCamera(
          CameraUpdate.newLatLngZoom(
            _currentLocation,
            15.0,
          ),
        );
      }
    } catch (e) {
      print('Erro ao atualizar localização: $e');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Erro ao atualizar localização: $e')),
      );
    }
  }

  String _getTimeAgo(DateTime dateTime) {
    final now = DateTime.now();
    final difference = now.difference(dateTime);

    if (difference.inMinutes < 1) {
      return 'Agora';
    } else if (difference.inHours < 1) {
      return '${difference.inMinutes}m atrás';
    } else if (difference.inDays < 1) {
      return '${difference.inHours}h atrás';
    } else if (difference.inDays < 7) {
      return '${difference.inDays}d atrás';
    } else {
      return '${dateTime.day}/${dateTime.month}/${dateTime.year}';
    }
  }

  Color _getStatusColor(EmergencyStatus status) {
    switch (status) {
      case EmergencyStatus.pending:
        return const Color(0xFFD69E2E);
      case EmergencyStatus.accepted:
        return const Color(0xFF3182CE);
      case EmergencyStatus.inProgress:
        return const Color(0xFF805AD5);
      case EmergencyStatus.completed:
        return const Color(0xFF38A169);
      case EmergencyStatus.cancelled:
        return const Color(0xFFE53E3E);
    }
  }

  String _getStatusText(EmergencyStatus status) {
    switch (status) {
      case EmergencyStatus.pending:
        return 'Pendente';
      case EmergencyStatus.accepted:
        return 'Aceita';
      case EmergencyStatus.inProgress:
        return 'Em Andamento';
      case EmergencyStatus.completed:
        return 'Concluída';
      case EmergencyStatus.cancelled:
        return 'Cancelada';
    }
  }

  String _getTypeText(EmergencyType type) {
    switch (type) {
      case EmergencyType.mechanical:
        return 'Problema Mecânico';
      case EmergencyType.flatTire:
        return 'Pneu Furado';
      case EmergencyType.noFuel:
        return 'Sem Combustível';
      case EmergencyType.deadBattery:
        return 'Bateria Descarga';
      case EmergencyType.towing:
        return 'Guincho';
      case EmergencyType.other:
        return 'Outro';
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF7FAFC),
      drawer: const AppDrawer(),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: Row(
          children: [
            Expanded(
              child: GestureDetector(
                onTap: () {
                  // Buscar endereço novamente ao tocar
                  _refreshLocation();
                },
                child: Row(
                  children: [
                    const Icon(
                      Icons.location_on,
                      color: Color(0xFFE53E3E),
                      size: 20,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _currentAddress,
                        style: GoogleFonts.poppins(
                          fontSize: 16,
                          fontWeight: FontWeight.w500,
                          color: const Color(0xFF2D3748),
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const Icon(
                      Icons.keyboard_arrow_down,
                      color: Color(0xFF718096),
                      size: 20,
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(width: 16),
            Stack(
              children: [
                IconButton(
                  onPressed: () {
                    Navigator.pushNamed(context, '/notifications');
                  },
                  icon: const Icon(
                    Icons.notifications_outlined,
                    color: Color(0xFF2D3748),
                  ),
                ),
                Positioned(
                  right: 8,
                  top: 8,
                  child: Container(
                    width: 8,
                    height: 8,
                    decoration: const BoxDecoration(
                      color: Color(0xFFE53E3E),
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
      body: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Saudação
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(20),
              color: Colors.white,
              child: Text(
                'Olá, ${AuthService.currentUser?.name?.split(' ').first ?? 'Cliente'}',
                style: GoogleFonts.poppins(
                  fontSize: 18,
                  fontWeight: FontWeight.w600,
                  color: const Color(0xFF2D3748),
                ),
              ),
            ),
            
            // Google Maps Real
            Container(
              width: double.infinity,
              height: 400,
              child: Stack(
                children: [
                  GoogleMap(
                    onMapCreated: (GoogleMapController controller) {
                      _mapController = controller;
                      setState(() {
                        _isMapReady = true;
                      });
                      // Centralizar no usuário quando o mapa estiver pronto
                      _centerMapOnUser();
                    },
                    initialCameraPosition: CameraPosition(
                      target: _currentLocation,
                      zoom: 15.0,
                    ),
                    markers: _markers,
                    myLocationEnabled: true,
                    myLocationButtonEnabled: false,
                    mapType: MapType.normal,
                    zoomControlsEnabled: false,
                  ),
                  // Botão de localização
                  Positioned(
                    bottom: 80,
                    right: 16,
                    child: FloatingActionButton(
                      mini: true,
                      backgroundColor: Colors.white,
                      onPressed: () async {
                        if (_mapController != null) {
                          try {
                            final position = await Geolocator.getCurrentPosition();
                            _mapController!.animateCamera(
                              CameraUpdate.newLatLng(
                                LatLng(position.latitude, position.longitude),
                              ),
                            );
                          } catch (e) {
                            print('Erro ao obter localização: $e');
                          }
                        }
                      },
                    child: const Icon(
                        Icons.my_location,
                        color: Color(0xFFE53E3E),
                      ),
                    ),
                  ),
                  // Botão de Pedir Socorro dentro do mapa
                  Positioned(
                    bottom: 16,
                    left: 16,
                    right: 16,
                    child: Container(
                        width: double.infinity,
                      child: ElevatedButton(
                        onPressed: () {
                          Navigator.pushNamed(context, '/emergency-request');
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFFE53E3E),
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                          elevation: 4,
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(
                              Icons.motorcycle,
                              size: 24,
                            ),
                            const SizedBox(width: 8),
                            const Icon(
                              Icons.build,
                              size: 20,
                            ),
                            const SizedBox(width: 12),
                            Text(
                              'PEDIR SOCORRO AGORA',
                              style: GoogleFonts.poppins(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ],
                        ),
                      ),
                            ),
                          ),
                        ],
                      ),
            ),
                      
            // Grid de serviços principais
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(20),
              color: Colors.white,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                  Text(
                    'Outros Serviços',
                    style: GoogleFonts.poppins(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: const Color(0xFF2D3748),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: [
                      _buildServiceIcon(
                        icon: Icons.local_gas_station,
                        title: 'Combustível',
                        color: const Color(0xFF38A169),
                        onTap: () {
                          Navigator.pushNamed(
                            context,
                            '/emergency-request',
                            arguments: {'type': EmergencyType.noFuel},
                          );
                        },
                      ),
                      _buildServiceIcon(
                        icon: Icons.local_taxi,
                        title: 'Guincho',
                        color: const Color(0xFF805AD5),
                        onTap: () {
                          Navigator.pushNamed(
                            context,
                            '/emergency-request',
                            arguments: {'type': EmergencyType.towing},
                          );
                        },
                      ),
                      _buildServiceIcon(
                        icon: Icons.battery_charging_full,
                        title: 'Bateria',
                        color: const Color(0xFFD69E2E),
                        onTap: () {
                          Navigator.pushNamed(
                            context,
                            '/emergency-request',
                            arguments: {'type': EmergencyType.deadBattery},
                          );
                        },
                      ),
                      _buildServiceIcon(
                        icon: Icons.tire_repair,
                        title: 'Pneus',
                        color: const Color(0xFF2D3748),
                        onTap: () {
                          Navigator.pushNamed(
                            context,
                            '/emergency-request',
                            arguments: {'type': EmergencyType.flatTire},
                          );
                        },
                      ),
                    ],
                  ),
                ],
              ),
            ),
            
            const SizedBox(height: 8),
            
            // Últimos socorros
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(20),
              color: Colors.white,
      child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
                        'Últimos Socorros',
            style: GoogleFonts.poppins(
                          fontSize: 18,
              fontWeight: FontWeight.bold,
                          color: const Color(0xFF2D3748),
                        ),
                      ),
                      GestureDetector(
                        onTap: () {
                          Navigator.pushNamed(context, '/emergency-history');
                        },
                        child: Text(
                          'Ver mais',
            style: GoogleFonts.poppins(
                            fontSize: 14,
                            color: const Color(0xFFE53E3E),
                            fontWeight: FontWeight.w500,
                          ),
            ),
          ),
        ],
      ),
                  const SizedBox(height: 16),
                  _isLoadingEmergencies
                      ? const Center(
                          child: Padding(
                            padding: EdgeInsets.all(20.0),
                            child: CircularProgressIndicator(),
                          ),
                        )
                      : _recentEmergencies.isEmpty
                          ? Padding(
                              padding: const EdgeInsets.all(20.0),
                              child: Text(
                                'Nenhuma emergência recente',
                                style: GoogleFonts.poppins(
                                  fontSize: 14,
                                  color: const Color(0xFF718096),
                                ),
                              ),
                            )
                          : SizedBox(
                              height: 120,
                              child: ListView.builder(
                                scrollDirection: Axis.horizontal,
                                itemCount: _recentEmergencies.length,
                                itemBuilder: (context, index) {
                                  final emergency = _recentEmergencies[index];
                                  final timeAgo = _getTimeAgo(emergency.createdAt);
                                  final statusColor = _getStatusColor(emergency.status);
                                  final statusText = _getStatusText(emergency.status);
                                  final typeText = _getTypeText(emergency.type);

                                  return GestureDetector(
                                    onTap: () {
                                      Navigator.pushNamed(
                                        context,
                                        '/emergency-history',
                                      );
                                    },
                                    child: Container(
                                      width: 200,
                                      margin: const EdgeInsets.only(right: 12),
                                      padding: const EdgeInsets.all(16),
                                      decoration: BoxDecoration(
                                        color: Colors.grey[50],
                                        borderRadius: BorderRadius.circular(12),
                                        border: Border.all(color: Colors.grey[200]!),
                                      ),
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Row(
                                            children: [
                                              Container(
                                                width: 40,
                                                height: 40,
                                                decoration: BoxDecoration(
                                                  color: const Color(0xFFE53E3E).withOpacity(0.1),
                                                  borderRadius: BorderRadius.circular(8),
                                                ),
                                                child: const Icon(
                                                  Icons.build,
                                                  color: Color(0xFFE53E3E),
                                                  size: 20,
                                                ),
                                              ),
                                              const SizedBox(width: 12),
                                              Expanded(
                                                child: Column(
                                                  crossAxisAlignment: CrossAxisAlignment.start,
                                                  children: [
                                                    Text(
                                                      typeText,
                                                      style: GoogleFonts.poppins(
                                                        fontSize: 14,
                                                        fontWeight: FontWeight.w600,
                                                        color: const Color(0xFF2D3748),
                                                      ),
                                                      maxLines: 1,
                                                      overflow: TextOverflow.ellipsis,
                                                    ),
                                                    Text(
                                                      timeAgo,
                                                      style: GoogleFonts.poppins(
                                                        fontSize: 12,
                                                        color: const Color(0xFF718096),
                                                      ),
                                                    ),
                                                  ],
                                                ),
                                              ),
                                            ],
                                          ),
                                          const SizedBox(height: 8),
                                          Text(
                                            'Status: $statusText',
                                            style: GoogleFonts.poppins(
                                              fontSize: 12,
                                              color: statusColor,
                                              fontWeight: FontWeight.w500,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  );
                                },
                              ),
                            ),
            ],
          ),
            ),
            
            const SizedBox(height: 8),
            
            // Parceiros próximos
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(20),
              color: Colors.white,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
                        'Parceiros',
          style: GoogleFonts.poppins(
            fontSize: 18,
            fontWeight: FontWeight.bold,
                          color: const Color(0xFF2D3748),
          ),
        ),
        Text(
                        'perto de você >',
          style: GoogleFonts.poppins(
            fontSize: 14,
                          color: const Color(0xFF3182CE),
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
                  ),
                  const SizedBox(height: 16),
                  _isLoadingPartners
                      ? const Center(
                          child: Padding(
                            padding: EdgeInsets.all(20.0),
                            child: CircularProgressIndicator(),
                          ),
                        )
                      : _nearbyPartners.isEmpty
                          ? Padding(
                              padding: const EdgeInsets.all(20.0),
                              child: Text(
                                'Nenhum parceiro próximo',
                                style: GoogleFonts.poppins(
                                  fontSize: 14,
                                  color: const Color(0xFF718096),
                                ),
                              ),
                            )
                          : SizedBox(
                              height: 120,
                              child: ListView.builder(
                                scrollDirection: Axis.horizontal,
                                itemCount: _nearbyPartners.length > 4 ? 4 : _nearbyPartners.length,
                                itemBuilder: (context, index) {
                                  final partner = _nearbyPartners[index];
                                  final distance = partner.distance != null
                                      ? '${partner.distance!.toStringAsFixed(1)} km'
                                      : '';

                                  return Container(
                                    width: 200,
                                    margin: const EdgeInsets.only(right: 12),
                                    padding: const EdgeInsets.all(16),
                                    decoration: BoxDecoration(
                                      color: Colors.white,
                                      borderRadius: BorderRadius.circular(12),
                                      border: Border.all(color: Colors.grey[200]!),
                                      boxShadow: [
                                        BoxShadow(
                                          color: Colors.black.withOpacity(0.05),
                                          blurRadius: 8,
                                          offset: const Offset(0, 2),
                                        ),
                                      ],
                                    ),
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Row(
                                          children: [
                                            Container(
                                              width: 40,
                                              height: 40,
                                              decoration: BoxDecoration(
                                                color: const Color(0xFF3182CE).withOpacity(0.1),
                                                borderRadius: BorderRadius.circular(8),
                                              ),
                                              child: const Icon(
                                                Icons.build,
                                                color: Color(0xFF3182CE),
                                                size: 20,
                                              ),
                                            ),
                                            const SizedBox(width: 12),
                                            Expanded(
                                              child: Column(
                                                crossAxisAlignment: CrossAxisAlignment.start,
                                                children: [
                                                  Text(
                                                    partner.businessName,
                                                    style: GoogleFonts.poppins(
                                                      fontSize: 14,
                                                      fontWeight: FontWeight.w600,
                                                      color: const Color(0xFF2D3748),
                                                    ),
                                                    maxLines: 1,
                                                    overflow: TextOverflow.ellipsis,
                                                  ),
                                                  Row(
                                                    children: [
                                                      const Icon(
                                                        Icons.star,
                                                        color: Color(0xFFD69E2E),
                                                        size: 14,
                                                      ),
                                                      const SizedBox(width: 4),
                                                      Text(
                                                        partner.rating.toStringAsFixed(1),
                                                        style: GoogleFonts.poppins(
                                                          fontSize: 12,
                                                          color: const Color(0xFF718096),
                                                        ),
                                                      ),
                                                      if (distance.isNotEmpty) ...[
                                                        const SizedBox(width: 8),
                                                        Text(
                                                          distance,
                                                          style: GoogleFonts.poppins(
                                                            fontSize: 12,
                                                            color: const Color(0xFF718096),
                                                          ),
                                                        ),
                                                      ],
                                                    ],
                                                  ),
                                                ],
                                              ),
                                            ),
                                          ],
                                        ),
                                      ],
                                    ),
                                  );
                                },
                              ),
                            ),
                        ],
                      ),
            ),
            
            const SizedBox(height: 100), // Espaço para a bottom navigation
          ],
        ),
      ),
      bottomNavigationBar: Container(
        height: 80,
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
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceAround,
          children: [
            _buildBottomNavItem(
              icon: Icons.home, 
              label: 'Início', 
              isSelected: true,
              onTap: () {
                // Já está na home
              },
            ),
            _buildBottomNavItem(
              icon: Icons.search, 
              label: 'Busca', 
              isSelected: false,
              onTap: () {
                Navigator.pushNamed(context, '/emergency-request');
              },
            ),
            _buildBottomNavItem(
              icon: Icons.history, 
              label: 'Histórico', 
              isSelected: false,
              onTap: () {
                Navigator.pushNamed(context, '/emergency-history');
              },
            ),
            _buildBottomNavItem(
              icon: Icons.payment, 
              label: 'Pagamentos', 
              isSelected: false,
              onTap: () {
                Navigator.pushNamed(context, '/payments');
              },
            ),
            _buildBottomNavItem(
              icon: Icons.person, 
              label: 'Perfil', 
              isSelected: false,
              onTap: () {
                Navigator.pushNamed(context, '/profile');
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildServiceIcon({
    required IconData icon,
    required String title,
    required Color color,
    required VoidCallback onTap,
  }) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: Column(
          children: [
            Container(
              width: 50,
              height: 50,
        decoration: BoxDecoration(
                color: color.withOpacity(0.1),
                borderRadius: BorderRadius.circular(12),
        ),
        child: Icon(
          icon,
                color: color,
                size: 24,
        ),
      ),
            const SizedBox(height: 6),
            Text(
        title,
        style: GoogleFonts.poppins(
                fontSize: 11,
          fontWeight: FontWeight.w500,
                color: const Color(0xFF2D3748),
              ),
              textAlign: TextAlign.center,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBottomNavItem({
    required IconData icon,
    required String label,
    required bool isSelected,
    required VoidCallback onTap,
  }) {
    return Expanded(
      child: InkWell(
        onTap: onTap,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              icon,
              color: isSelected ? const Color(0xFFE53E3E) : const Color(0xFF718096),
              size: 24,
            ),
            const SizedBox(height: 4),
            Text(
              label,
              style: GoogleFonts.poppins(
                fontSize: 12,
                color: isSelected ? const Color(0xFFE53E3E) : const Color(0xFF718096),
                fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
              ),
            ),
          ],
        ),
      ),
    );
  }
}