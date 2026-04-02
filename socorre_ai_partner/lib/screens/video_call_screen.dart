import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:permission_handler/permission_handler.dart';
import '../services/api_service.dart';
import '../models/call_model.dart';

class VideoCallScreen extends StatefulWidget {
  final String appointmentId;
  final String partnerName;
  final String partnerAvatar;

  VideoCallScreen({
    required this.appointmentId,
    required this.partnerName,
    required this.partnerAvatar,
  });

  @override
  _VideoCallScreenState createState() => _VideoCallScreenState();
}

class _VideoCallScreenState extends State<VideoCallScreen> {
  bool _isCallActive = false;
  bool _isMuted = false;
  bool _isSpeakerEnabled = false;
  bool _isCameraEnabled = true;
  bool _isFrontCamera = true;
  bool _isLoading = true;
  String? _localVideoPath;
  String? _remoteVideoPath;
  dynamic _rtcPeerConnection;
  dynamic _localStream;
  dynamic _remoteStream;

  @override
  void initState() {
    super.initState();
    _requestPermissions();
    _initializeCall();
  }

  Future<void> _requestPermissions() async {
    final permissions = [
      Permission.camera,
      Permission.microphone,
    ];

    final status = await permissions.request();
    
    if (status[Permission.camera] != PermissionStatus.granted ||
        status[Permission.microphone] != PermissionStatus.granted) {
      _showPermissionDialog();
    }
  }

  void _showPermissionDialog() {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: Text('Permissões Necessárias'),
          content: Text('Para fazer chamadas de vídeo, precisamos acessar sua câmera e microfone.'),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: Text('Cancelar'),
            ),
            TextButton(
              onPressed: () {
                openAppSettings();
                Navigator.of(context).pop();
              },
              child: Text('Configurar'),
            ),
          ],
        );
      },
    );
  }

  Future<void> _initializeCall() async {
    try {
      // Inicializar WebRTC
      _rtcPeerConnection = await _createPeerConnection();
      
      // Adicionar stream local
      _localStream = await navigator.mediaDevices.getUserMedia({
        'video': true,
        'audio': true,
      });
      
      _localStream.getTracks().forEach((track) {
        _rtcPeerConnection.addTrack(track, _localStream);
      });
      
      setState(() {
        _isLoading = false;
        _isCallActive = true;
      });
      
      // Notificar backend que a chamada foi iniciada
      await ApiService.startVideoCall(widget.appointmentId);
      
    } catch (e) {
      setState(() => _isLoading = false);
      _showErrorDialog('Erro ao inicializar chamada de vídeo');
    }
  }

  Future<dynamic> _createPeerConnection() async {
    // Configuração WebRTC simplificada
    final configuration = {
      'iceServers': [
        {'urls': 'stun:stun.l.google.com:19302'},
      ],
    };
    
    // Em uma implementação real, usaríamos webdart_package
    // Para este exemplo, vamos simular
    return {};
  }

  void _toggleMute() {
    setState(() => _isMuted = !_isMuted);
    
    if (_localStream != null) {
      _localStream.getAudioTracks().forEach((track) {
        track.enabled = !_isMuted;
      });
    }
  }

  void _toggleSpeaker() {
    setState(() => _isSpeakerEnabled = !_isSpeakerEnabled);
    
    if (_remoteStream != null) {
      _remoteStream.getAudioTracks().forEach((track) {
        track.enableSpeaker = !_isSpeakerEnabled;
      });
    }
  }

  void _toggleCamera() {
    setState(() {
      _isFrontCamera = !_isFrontCamera;
      _isCameraEnabled = !_isCameraEnabled;
    });
    
    if (_localStream != null) {
      _localStream.getVideoTracks().forEach((track) {
        track.enabled = _isCameraEnabled;
      });
    }
  }

  void _switchCamera() async {
    try {
      final devices = await navigator.mediaDevices.enumerateDevices();
      final videoDevices = devices.where((device) => device.kind == 'videoinput').toList();
      
      if (videoDevices.length > 1) {
        // Lógica para alternar entre câmeras
        // Em implementação real, usaríamos getUserMedia com novo deviceId
      }
    } catch (e) {
      _showErrorDialog('Erro ao alternar câmera');
    }
  }

  Future<void> _endCall() async {
    try {
      setState(() => _isCallActive = false);
      
      // Parar streams
      if (_localStream != null) {
        _localStream.getTracks().forEach((track) => track.stop());
      }
      
      if (_remoteStream != null) {
        _remoteStream.getTracks().forEach((track) => track.stop());
      }
      
      // Fechar conexão WebRTC
      if (_rtcPeerConnection != null) {
        await _rtcPeerConnection.close();
      }
      
      // Notificar backend
      await ApiService.endVideoCall(widget.appointmentId);
      
      // Voltar para tela anterior
      Navigator.of(context).pop();
      
    } catch (e) {
      _showErrorDialog('Erro ao encerrar chamada');
    }
  }

  void _showErrorDialog(String message) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: Text('Erro'),
          content: Text(message),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: Text('OK'),
            ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Stack(
          children: [
            // Video principal
            Positioned.fill(
              child: _isLoading
                  ? _buildLoadingState()
                  : _buildVideoArea(),
            ),
            
            // Header com informações
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: Container(
                padding: EdgeInsets.all(16),
                color: Colors.black.withOpacity(0.7),
                child: Row(
                  children: [
                    // Avatar do parceiro
                    CircleAvatar(
                      radius: 25,
                      backgroundImage: NetworkImage(widget.partnerAvatar),
                      onBackgroundImageError: (exception, stackTrace) {
                        return AssetImage('assets/images/default_avatar.png');
                      },
                    ),
                    SizedBox(width: 12),
                    
                    // Nome e status
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            widget.partnerName,
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          Text(
                            _isCallActive ? 'Em chamada' : 'Conectando...',
                            style: TextStyle(
                              color: Colors.white70,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ),
                    
                    // Botão de encerrar
                    IconButton(
                      onPressed: _endCall,
                      icon: Icon(Icons.call_end, color: Colors.white),
                      style: IconButton.styleFrom(
                        backgroundColor: Colors.red[600],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            
            // Controles de vídeo
            Positioned(
              bottom: 100,
              left: 20,
              right: 20,
              child: Container(
                padding: EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                decoration: BoxDecoration(
                  color: Colors.black.withOpacity(0.8),
                  borderRadius: BorderRadius.circular(30),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    // Mute/Unmute
                    IconButton(
                      onPressed: _toggleMute,
                      icon: Icon(
                        _isMuted ? Icons.mic_off : Icons.mic,
                        color: Colors.white,
                      ),
                      style: IconButton.styleFrom(
                        backgroundColor: Colors.grey[700],
                      ),
                    ),
                    
                    // Alternar câmera
                    IconButton(
                      onPressed: _switchCamera,
                      icon: Icon(
                        Icons.flip_camera_ios,
                        color: Colors.white,
                      ),
                      style: IconButton.styleFrom(
                        backgroundColor: Colors.grey[700],
                      ),
                    ),
                    
                    // Ligar/Desligar câmera
                    IconButton(
                      onPressed: _toggleCamera,
                      icon: Icon(
                        _isCameraEnabled ? Icons.videocam : Icons.videocam_off,
                        color: Colors.white,
                      ),
                      style: IconButton.styleFrom(
                        backgroundColor: Colors.grey[700],
                      ),
                    ),
                    
                    // Viva-voz
                    IconButton(
                      onPressed: _toggleSpeaker,
                      icon: Icon(
                        _isSpeakerEnabled ? Icons.volume_up : Icons.volume_off,
                        color: Colors.white,
                      ),
                      style: IconButton.styleFrom(
                        backgroundColor: Colors.grey[700],
                      ),
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

  Widget _buildLoadingState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          CircularProgressIndicator(
            valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
          ),
          SizedBox(height: 20),
          Text(
            'Conectando com ${widget.partnerName}...',
            style: TextStyle(
              color: Colors.white,
              fontSize: 16,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildVideoArea() {
    return Container(
      width: double.infinity,
      height: double.infinity,
      color: Colors.black,
      child: Stack(
        children: [
          // Vídeo remoto (do parceiro)
          Positioned.fill(
            child: Container(
              color: Colors.grey[900],
              child: Center(
                child: Text(
                  'Vídeo do parceiro',
                  style: TextStyle(color: Colors.white),
                ),
              ),
            ),
          ),
          
          // Vídeo local (do usuário)
          if (_isCameraEnabled)
            Positioned(
              bottom: 20,
              right: 20,
              width: 120,
              height: 160,
              child: Container(
                decoration: BoxDecoration(
                  color: Colors.grey[800],
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.white, width: 2),
                ),
                child: Center(
                  child: Text(
                    'Seu vídeo',
                    style: TextStyle(color: Colors.white, fontSize: 12),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
