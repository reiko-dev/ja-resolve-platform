import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:permission_handler/permission_handler.dart';
import '../core/utils/partner_document_rules.dart';
import '../core/utils/partner_type_utils.dart';
import '../services/api_service.dart';
import '../services/onboarding_flow_service.dart';
import '../models/document_model.dart';

class PartnerDocumentUploadScreen extends StatefulWidget {
  final String partnerType; // mechanic, motoboy, gas_station, auto_parts, tow

  const PartnerDocumentUploadScreen({super.key, required this.partnerType});

  @override
  _PartnerDocumentUploadScreenState createState() => _PartnerDocumentUploadScreenState();
}

class _PartnerDocumentUploadScreenState extends State<PartnerDocumentUploadScreen> {
  final List<PartnerDocument> _uploadedDocuments = [];
  bool _isLoading = false;
  final ImagePicker _imagePicker = ImagePicker();

  String get _normalizedPartnerType => PartnerTypeUtils.normalize(widget.partnerType);

  List<RequiredDocument> get _requiredDocuments {
    return PartnerDocumentRules.getAll(_normalizedPartnerType)
        .map(
          (document) => RequiredDocument(
            type: document.type,
            title: document.title,
            description: document.description,
            required: document.required,
          ),
        )
        .toList();
  }

  @override
  void initState() {
    super.initState();
    _loadExistingDocuments();
  }

  void _setUploadedDocuments(List<PartnerDocument> documents) {
    final documentsByType = <String, PartnerDocument>{};
    for (final document in documents) {
      documentsByType[PartnerDocumentRules.normalizeDocumentType(document.documentType)] = document;
    }

    _uploadedDocuments
      ..clear()
      ..addAll(documentsByType.values);
  }

  int get _uploadedRequiredCount {
    final uploadedTypes = _uploadedDocuments
        .map((document) => PartnerDocumentRules.normalizeDocumentType(document.documentType))
        .toSet();

    return _requiredDocuments
        .where((document) => uploadedTypes.contains(document.type))
        .length;
  }

  Future<void> _loadExistingDocuments() async {
    setState(() => _isLoading = true);

    try {
      final statusResponse = await ApiService.getPartnerOnboardingStatus();
      if (!mounted) return;

      if (!statusResponse['success']) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              statusResponse['message'] ?? 'Não foi possível verificar o estágio do onboarding',
            ),
          ),
        );
        return;
      }

      final onboardingData = statusResponse['data'] as Map<String, dynamic>;
      final onboardingStage = onboardingData['onboardingStage'] as String? ?? '';

      if (onboardingStage != 'under_review' && onboardingStage != 'approved') {
        setState(() {
          _uploadedDocuments.clear();
        });
        return;
      }

      final response = await ApiService.getPartnerDocuments();
      if (!mounted) return;

      if (response['success']) {
        final data = response['data'] as Map<String, dynamic>;
        final documents = (data['documents'] as List<dynamic>? ?? [])
            .map((item) => PartnerDocument.fromJson(item as Map<String, dynamic>))
            .toList();

        setState(() {
          _setUploadedDocuments(documents);
        });
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              response['message'] ?? 'Não foi possível recarregar os documentos já enviados',
            ),
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<bool> _ensureCameraPermission() async {
    final status = await Permission.camera.request();
    if (status.isGranted) {
      return true;
    }

    if (mounted) {
      _showPermissionDialog(forCamera: true);
    }
    return false;
  }

  Future<bool> _ensureGalleryPermission() async {
    if (defaultTargetPlatform == TargetPlatform.android) {
      final photosStatus = await Permission.photos.request();
      if (photosStatus.isGranted || photosStatus.isLimited) {
        return true;
      }

      final storageStatus = await Permission.storage.request();
      if (storageStatus.isGranted) {
        return true;
      }

      if (mounted) {
        _showPermissionDialog(forCamera: false);
      }
      return false;
    }

    final photosStatus = await Permission.photos.request();
    if (photosStatus.isGranted || photosStatus.isLimited) {
      return true;
    }

    if (mounted) {
      _showPermissionDialog(forCamera: false);
    }
    return false;
  }

  void _showPermissionDialog({required bool forCamera}) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: Text('Permissões Necessárias'),
          content: Text(
            forCamera
                ? 'Para tirar a foto do documento, precisamos acessar sua câmera.'
                : 'Para escolher um documento da galeria, precisamos acessar suas fotos.',
          ),
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

  Future<void> _pickImage(RequiredDocument document) async {
    try {
      final hasPermission = await _ensureGalleryPermission();
      if (!hasPermission) {
        return;
      }

      final XFile? image = await _imagePicker.pickImage(
        source: ImageSource.gallery,
        maxWidth: 1920,
        maxHeight: 1080,
        imageQuality: 85,
      );

      if (image != null) {
        await _uploadDocument(image, document);
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Erro ao selecionar imagem: $e')),
      );
    }
  }

  Future<void> _takePhoto(RequiredDocument document) async {
    try {
      final hasPermission = await _ensureCameraPermission();
      if (!hasPermission) {
        return;
      }

      final XFile? photo = await _imagePicker.pickImage(
        source: ImageSource.camera,
        maxWidth: 1920,
        maxHeight: 1080,
        imageQuality: 85,
      );

      if (photo != null) {
        await _uploadDocument(photo, document);
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Erro ao tirar foto: $e')),
      );
    }
  }

  Future<void> _uploadDocument(XFile file, RequiredDocument document) async {
    setState(() => _isLoading = true);

    try {
      final response = await ApiService.uploadPartnerDocument(
        file: file,
        documentType: document.type,
        partnerType: _normalizedPartnerType,
      );

      if (response['success']) {
        final newDocument = PartnerDocument.fromJson(response['data']);
        setState(() {
          _uploadedDocuments.removeWhere(
            (document) => PartnerDocumentRules.matchesType(document.documentType, newDocument.documentType),
          );
          _uploadedDocuments.add(newDocument);
        });
        
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Documento enviado com sucesso')),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(response['message'] ?? 'Erro ao enviar documento')),
        );
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Erro ao enviar documento: $e')),
      );
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _removeDocument(PartnerDocument document) async {
    try {
      final response = await ApiService.deletePartnerDocument(document.id);
      
      if (response['success']) {
        setState(() {
          _uploadedDocuments.removeWhere((doc) => doc.id == document.id);
        });
        
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Documento removido')),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Erro ao remover documento')),
        );
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Erro ao remover documento')),
      );
    }
  }

  bool _areAllRequiredDocumentsUploaded() {
    for (final doc in _requiredDocuments) {
      if (doc.required) {
        final hasDocument = _uploadedDocuments.any(
          (uploaded) => PartnerDocumentRules.matchesType(uploaded.documentType, doc.type),
        );
        if (!hasDocument) return false;
      }
    }
    return true;
  }

  Future<void> _submitForVerification() async {
    if (!_areAllRequiredDocumentsUploaded()) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Envie todos os documentos obrigatórios')),
      );
      return;
    }

    setState(() => _isLoading = true);

    try {
      final response = await ApiService.submitDocumentsForVerification(
        partnerType: _normalizedPartnerType,
        documentIds: _uploadedDocuments.map((doc) => doc.id).toList(),
      );

      if (response['success']) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Documentos enviados para verificação')),
        );

        if (mounted) {
          context.go(OnboardingFlowService.pendingReviewRoute);
        }
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(response['message'] ?? 'Erro ao enviar para verificação')),
        );
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Erro ao enviar para verificação')),
      );
    } finally {
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Documentos do Parceiro'),
        backgroundColor: _getPrimaryColor(),
        foregroundColor: Colors.white,
        elevation: 0,
      ),
      body: Column(
        children: [
          // Header informativo
          Container(
            padding: EdgeInsets.all(16),
            color: _getPrimaryColor().withValues(alpha: 0.1),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Documentos Obrigatórios',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: _getPrimaryColor(),
                  ),
                ),
                SizedBox(height: 8),
                Text(
                  'Complete seu cadastro como ${_getPartnerTypeName()}',
                  style: TextStyle(
                    fontSize: 14,
                    color: _getPrimaryColor().withValues(alpha: 0.8),
                  ),
                ),
                SizedBox(height: 12),
                LinearProgressIndicator(
                  value: _requiredDocuments.isEmpty ? 0 : _uploadedRequiredCount / _requiredDocuments.length,
                  backgroundColor: Colors.white,
                  valueColor: AlwaysStoppedAnimation<Color>(_getPrimaryColor()),
                ),
                SizedBox(height: 8),
                Text(
                  '$_uploadedRequiredCount de ${_requiredDocuments.length} documentos enviados',
                  style: TextStyle(
                    fontSize: 12,
                    color: _getPrimaryColor(),
                  ),
                ),
              ],
            ),
          ),
          
          // Lista de documentos
          Expanded(
            child: _isLoading
                ? Center(child: CircularProgressIndicator())
                : ListView.builder(
                    padding: EdgeInsets.all(8),
                    itemCount: _requiredDocuments.length,
                    itemBuilder: (context, index) {
                      final document = _requiredDocuments[index];
                      final uploadedDoc = _uploadedDocuments
                          .where((doc) => PartnerDocumentRules.matchesType(doc.documentType, document.type))
                          .firstOrNull;
                      
                      return _buildDocumentCard(document, uploadedDoc);
                    },
                  ),
          ),
          
          // Botões de ação
          Container(
            padding: EdgeInsets.fromLTRB(16, 8, 16, 20),
            child: _areAllRequiredDocumentsUploaded()
                ? Container(
                    width: double.infinity,
                    padding: EdgeInsets.all(18),
                    decoration: BoxDecoration(
                      color: _getPrimaryColor().withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(
                        color: _getPrimaryColor().withValues(alpha: 0.18),
                      ),
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
                                color: _getPrimaryColor().withValues(alpha: 0.14),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Icon(
                                Icons.verified_outlined,
                                color: _getPrimaryColor(),
                              ),
                            ),
                            SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'Tudo pronto para análise',
                                    style: TextStyle(
                                      fontSize: 16,
                                      fontWeight: FontWeight.bold,
                                      color: _getPrimaryColor(),
                                    ),
                                  ),
                                  SizedBox(height: 2),
                                  Text(
                                    'Seus documentos obrigatórios foram enviados. Agora finalize esta etapa.',
                                    style: TextStyle(
                                      fontSize: 12,
                                      color: Colors.grey[700],
                                      height: 1.35,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                        SizedBox(height: 16),
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton.icon(
                            onPressed: _submitForVerification,
                            icon: Icon(Icons.send_rounded),
                            label: Text('Enviar para Verificação'),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: _getPrimaryColor(),
                              foregroundColor: Colors.white,
                              elevation: 0,
                              padding: EdgeInsets.symmetric(vertical: 16),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(14),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  )
                : SizedBox.shrink(),
          ),
        ],
      ),
    );
  }

  Widget _buildDocumentCard(RequiredDocument document, PartnerDocument? uploadedDoc) {
    return Card(
      margin: EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Row(
              children: [
                Icon(
                  document.required ? Icons.assignment : Icons.description,
                  color: document.required ? _getPrimaryColor() : Colors.grey[600],
                ),
                SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        document.title,
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      Text(
                        document.description,
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.grey[600],
                        ),
                      ),
                    ],
                  ),
                ),
                if (document.required)
                  Container(
                    padding: EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: _getPrimaryColor().withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      'Obrigatório',
                      style: TextStyle(
                        fontSize: 10,
                        color: _getPrimaryColor(),
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
              ],
            ),
            
            SizedBox(height: 16),
            
            // Status do documento
            if (uploadedDoc != null)
              Container(
                padding: EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.green[50],
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.green.shade200),
                ),
                child: Row(
                  children: [
                    Icon(Icons.check_circle, color: Colors.green[600]),
                    SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Enviado',
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.green[700],
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          Text(
                            'Status: ${uploadedDoc.status}',
                            style: TextStyle(
                              fontSize: 10,
                              color: Colors.green[600],
                            ),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      onPressed: () => _removeDocument(uploadedDoc),
                      icon: Icon(Icons.delete, color: Colors.red[600]),
                    ),
                  ],
                ),
              )
            else
              Container(
                padding: EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.grey[50],
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.grey.shade200),
                ),
                child: Column(
                  children: [
                    Icon(Icons.cloud_upload, color: Colors.grey[600]),
                    SizedBox(height: 8),
                    Text(
                      'Documento não enviado',
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.grey[700],
                      ),
                    ),
                  ],
                ),
              ),
            
            SizedBox(height: 16),
            
            // Botões de upload
            if (uploadedDoc == null)
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: () => _pickImage(document),
                      icon: Icon(Icons.photo_library),
                      label: Text('Galeria'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.blue[600],
                      ),
                    ),
                  ),
                  SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: () => _takePhoto(document),
                      icon: Icon(Icons.camera_alt),
                      label: Text('Câmera'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.green[600],
                      ),
                    ),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }

  Color _getPrimaryColor() {
    switch (_normalizedPartnerType) {
      case 'mechanic':
        return Colors.red.shade600;
      case 'motoboy':
        return Colors.blue.shade800;
      case 'gas_station':
        return Colors.orange.shade600;
      case 'auto_parts':
        return Colors.green.shade600;
      case 'tow':
        return Colors.purple.shade600;
      default:
        return Colors.blue.shade600;
    }
  }

  String _getPartnerTypeName() {
    switch (_normalizedPartnerType) {
      case 'mechanic':
        return 'Mecânico';
      case 'motoboy':
        return 'Motoboy';
      case 'gas_station':
        return 'Posto de Combustível';
      case 'auto_parts':
        return 'Auto Peças';
      case 'tow':
        return 'Guincho';
      default:
        return 'Parceiro';
    }
  }
}

class RequiredDocument {
  final String type;
  final String title;
  final String description;
  final bool required;

  RequiredDocument({
    required this.type,
    required this.title,
    required this.description,
    required this.required,
  });
}
