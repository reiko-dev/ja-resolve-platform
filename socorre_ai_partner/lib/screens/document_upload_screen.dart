import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:permission_handler/permission_handler.dart';
import '../services/api_service.dart';
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

  // Documentos obrigatórios por tipo de parceiro
  List<RequiredDocument> get _requiredDocuments {
    switch (widget.partnerType) {
      case 'mechanic':
        return [
          RequiredDocument(
            type: 'rg_cpf',
            title: 'RG ou CPF',
            description: 'Documento de identidade com foto',
            required: true,
          ),
          RequiredDocument(
            type: 'cnh',
            title: 'CNH',
            description: 'Carteira Nacional de Habilitação',
            required: true,
          ),
          RequiredDocument(
            type: 'residence_proof',
            title: 'Comprovante de Residência',
            description: 'Conta de luz, água ou telefone',
            required: true,
          ),
          RequiredDocument(
            type: 'certification',
            title: 'Certificados Técnicos',
            description: 'Certificados de especialização (opcional)',
            required: false,
          ),
          RequiredDocument(
            type: 'workshop_photos',
            title: 'Fotos da Oficina',
            description: 'Fotos do ambiente de trabalho',
            required: false,
          ),
        ];
      
      case 'motoboy':
        return [
          RequiredDocument(
            type: 'rg_cpf',
            title: 'RG ou CPF',
            description: 'Documento de identidade com foto',
            required: true,
          ),
          RequiredDocument(
            type: 'cnh',
            title: 'CNH',
            description: 'Carteira Nacional de Habilitação (A ou AB)',
            required: true,
          ),
          RequiredDocument(
            type: 'crlv',
            title: 'CRLV',
            description: 'Certificado de Registro e Licenciamento do Veículo',
            required: true,
          ),
          RequiredDocument(
            type: 'residence_proof',
            title: 'Comprovante de Residência',
            description: 'Conta de luz, água ou telefone',
            required: true,
          ),
          RequiredDocument(
            type: 'vehicle_photos',
            title: 'Fotos da Moto',
            description: 'Fotos do veículo (frente, lateral, traseira)',
            required: false,
          ),
        ];
      
      case 'tow':
        return [
          RequiredDocument(
            type: 'rg_cpf',
            title: 'RG ou CPF',
            description: 'Documento de identidade com foto',
            required: true,
          ),
          RequiredDocument(
            type: 'cnh',
            title: 'CNH',
            description: 'Carteira Nacional de Habilitação (C, D ou E)',
            required: true,
          ),
          RequiredDocument(
            type: 'crlv',
            title: 'CRLV',
            description: 'Certificado de Registro e Licenciamento do Veículo',
            required: true,
          ),
          RequiredDocument(
            type: 'residence_proof',
            title: 'Comprovante de Residência',
            description: 'Conta de luz, água ou telefone',
            required: true,
          ),
          RequiredDocument(
            type: 'insurance_policy',
            title: 'Apólice de Seguro',
            description: 'Seguro do veículo (opcional)',
            required: false,
          ),
          RequiredDocument(
            type: 'tow_photos',
            title: 'Fotos do Guincho',
            description: 'Fotos do equipamento',
            required: false,
          ),
        ];
      
      case 'gas_station':
        return [
          RequiredDocument(
            type: 'rg_cpf',
            title: 'RG ou CPF',
            description: 'Documento de identidade com foto',
            required: true,
          ),
          RequiredDocument(
            type: 'cnpj',
            title: 'CNPJ',
            description: 'Cadastro Nacional da Pessoa Jurídica',
            required: true,
          ),
          RequiredDocument(
            type: 'business_license',
            title: 'Alvará de Funcionamento',
            description: 'Licença municipal de funcionamento',
            required: true,
          ),
          RequiredDocument(
            type: 'environmental_license',
            title: 'Licença Ambiental',
            description: 'Licença ambiental (se aplicável)',
            required: false,
          ),
          RequiredDocument(
            type: 'fire_safety',
            title: 'Alvará do Corpo de Bombeiros',
            description: 'Certificado de segurança',
            required: false,
          ),
          RequiredDocument(
            type: 'station_photos',
            title: 'Fotos do Posto',
            description: 'Fotos do estabelecimento',
            required: false,
          ),
        ];
      
      case 'auto_parts':
        return [
          RequiredDocument(
            type: 'rg_cpf',
            title: 'RG ou CPF',
            description: 'Documento de identidade com foto',
            required: true,
          ),
          RequiredDocument(
            type: 'cnpj',
            title: 'CNPJ',
            description: 'Cadastro Nacional da Pessoa Jurídica',
            required: true,
          ),
          RequiredDocument(
            type: 'business_license',
            title: 'Alvará de Funcionamento',
            description: 'Licença municipal de funcionamento',
            required: true,
          ),
          RequiredDocument(
            type: 'store_photos',
            title: 'Fotos da Loja',
            description: 'Fotos do estabelecimento',
            required: false,
          ),
          RequiredDocument(
            type: 'inventory_photos',
            title: 'Fotos do Estoque',
            description: 'Fotos dos produtos',
            required: false,
          ),
        ];
      
      default:
        return [];
    }
  }

  @override
  void initState() {
    super.initState();
    _requestPermissions();
  }

  Future<void> _requestPermissions() async {
    final permissions = [
      Permission.camera,
      Permission.storage,
    ];

    final status = await permissions.request();
    
    if (status[Permission.camera] != PermissionStatus.granted ||
        status[Permission.storage] != PermissionStatus.granted) {
      _showPermissionDialog();
    }
  }

  void _showPermissionDialog() {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: Text('Permissões Necessárias'),
          content: Text('Para enviar documentos, precisamos acessar sua câmera e armazenamento.'),
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
        const SnackBar(content: Text('Erro ao selecionar imagem')),
      );
    }
  }

  Future<void> _takePhoto(RequiredDocument document) async {
    try {
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
        const SnackBar(content: Text('Erro ao tirar foto')),
      );
    }
  }

  Future<void> _uploadDocument(XFile file, RequiredDocument document) async {
    setState(() => _isLoading = true);

    try {
      final response = await ApiService.uploadPartnerDocument(
        file: file,
        documentType: document.type,
        partnerType: widget.partnerType,
      );

      if (response['success']) {
        final newDocument = PartnerDocument.fromJson(response['data']);
        setState(() {
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
        const SnackBar(content: Text('Erro ao enviar documento')),
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
          (uploaded) => uploaded.documentType == doc.type,
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
        partnerType: widget.partnerType,
        documentIds: _uploadedDocuments.map((doc) => doc.id).toList(),
      );

      if (response['success']) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Documentos enviados para verificação')),
        );

        // Navegar para tela de status
        Navigator.of(context).pushNamed('/document-status');
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
            color: _getPrimaryColor().withOpacity(0.1),
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
                    color: _getPrimaryColor().withOpacity(0.8),
                  ),
                ),
                SizedBox(height: 12),
                LinearProgressIndicator(
                  value: _uploadedDocuments.length / _requiredDocuments.length,
                  backgroundColor: Colors.white,
                  valueColor: AlwaysStoppedAnimation<Color>(_getPrimaryColor()),
                ),
                SizedBox(height: 8),
                Text(
                  '${_uploadedDocuments.length} de ${_requiredDocuments.length} documentos enviados',
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
                          .where((doc) => doc.documentType == document.type)
                          .firstOrNull;
                      
                      return _buildDocumentCard(document, uploadedDoc);
                    },
                  ),
          ),
          
          // Botões de ação
          Container(
            padding: EdgeInsets.all(16),
            child: Column(
              children: [
                if (_areAllRequiredDocumentsUploaded())
                  ElevatedButton.icon(
                    onPressed: _submitForVerification,
                    icon: Icon(Icons.send),
                    label: Text('Enviar para Verificação'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: _getPrimaryColor(),
                      padding: EdgeInsets.symmetric(vertical: 16),
                    ),
                  ),
                SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: () {
                    Navigator.of(context).pushNamed('/dashboard');
                  },
                  icon: Icon(Icons.skip_next),
                  label: Text('Pular por Agora'),
                ),
              ],
            ),
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
                      color: _getPrimaryColor().withOpacity(0.2),
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
    switch (widget.partnerType) {
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
    switch (widget.partnerType) {
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
