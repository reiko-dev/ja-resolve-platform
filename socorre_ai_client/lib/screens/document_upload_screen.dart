import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../models/document_model.dart';
import '../services/api_service.dart';
import 'package:google_fonts/google_fonts.dart';

class DocumentUploadScreen extends StatefulWidget {
  final String userType; // client, partner
  final String partnerType; // mechanic, motoboy, gas_station, auto_parts, tow

  DocumentUploadScreen({
    required this.userType,
    this.partnerType = '',
  });

  @override
  _DocumentUploadScreenState createState() => _DocumentUploadScreenState();
}

class _DocumentUploadScreenState extends State<DocumentUploadScreen> {
  List<Document> _uploadedDocuments = [];
  bool _isLoading = false;
  final ImagePicker _imagePicker = ImagePicker();

  List<RequiredDocument> get _requiredDocuments {
    if (widget.userType == 'client') {
      return [
        RequiredDocument(
          type: 'rg_cpf',
          title: 'RG/CPF',
          description: 'Documento de identificação com foto',
          required: true,
        ),
        RequiredDocument(
          type: 'residence_proof',
          title: 'Comprovante de Residência',
          description: 'Conta de luz, água ou telefone dos últimos 30 dias',
          required: true,
        ),
      ];
    } else {
      // Partner documents based on type
      switch (widget.partnerType) {
        case 'mechanic':
          return [
            RequiredDocument(
              type: 'rg_cpf',
              title: 'RG/CPF',
              description: 'Documento de identificação com foto',
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
              description: 'Conta de luz, água ou telefone dos últimos 30 dias',
              required: true,
            ),
            RequiredDocument(
              type: 'certification',
              title: 'Certificados',
              description: 'Certificados de cursos mecânicos (opcional)',
              required: false,
            ),
          ];
        case 'motoboy':
          return [
            RequiredDocument(
              type: 'rg_cpf',
              title: 'RG/CPF',
              description: 'Documento de identificação com foto',
              required: true,
            ),
            RequiredDocument(
              type: 'cnh',
              title: 'CNH (A ou AB)',
              description: 'Carteira Nacional de Habilitação categoria A ou AB',
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
              description: 'Conta de luz, água ou telefone dos últimos 30 dias',
              required: true,
            ),
          ];
        case 'tow':
          return [
            RequiredDocument(
              type: 'rg_cpf',
              title: 'RG/CPF',
              description: 'Documento de identificação com foto',
              required: true,
            ),
            RequiredDocument(
              type: 'cnh',
              title: 'CNH (C, D ou E)',
              description: 'Carteira Nacional de Habilitação categoria C, D ou E',
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
              description: 'Conta de luz, água ou telefone dos últimos 30 dias',
              required: true,
            ),
            RequiredDocument(
              type: 'insurance_policy',
              title: 'Apólice de Seguro',
              description: 'Seguro do guincho (opcional)',
              required: false,
            ),
          ];
        case 'gas_station':
          return [
            RequiredDocument(
              type: 'rg_cpf',
              title: 'RG/CPF',
              description: 'Documento de identificação com foto',
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
              description: 'Alvará da prefeitura',
              required: true,
            ),
            RequiredDocument(
              type: 'environmental_license',
              title: 'Licença Ambiental',
              description: 'Licenciamento ambiental (opcional)',
              required: false,
            ),
          ];
        case 'auto_parts':
          return [
            RequiredDocument(
              type: 'rg_cpf',
              title: 'RG/CPF',
              description: 'Documento de identificação com foto',
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
              description: 'Alvará da prefeitura',
              required: true,
            ),
          ];
        default:
          return [];
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF7FAFC),
      appBar: AppBar(
        title: Text(
          'Documentos',
          style: GoogleFonts.poppins(
            fontSize: 20,
            fontWeight: FontWeight.bold,
            color: Colors.white,
          ),
        ),
        backgroundColor: const Color(0xFFE53E3E),
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.05),
                  blurRadius: 10,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Documentos necessários',
                  style: GoogleFonts.poppins(
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                    color: const Color(0xFF2D3748),
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  widget.userType == 'client'
                      ? 'Envie os documentos necessários para completar seu cadastro'
                      : 'Envie os documentos necessários para verificar sua conta de parceiro',
                  style: GoogleFonts.poppins(
                    fontSize: 14,
                    color: const Color(0xFF718096),
                  ),
                ),
                const SizedBox(height: 12),
                LinearProgressIndicator(
                  value: _uploadedDocuments.length / _requiredDocuments.length,
                  backgroundColor: Colors.blue[100],
                  valueColor: AlwaysStoppedAnimation<Color>(Colors.blue[600] ?? Colors.blue),
                ),
                const SizedBox(height: 8),
                Text(
                  '${_uploadedDocuments.length} de ${_requiredDocuments.length} documentos enviados',
                  style: GoogleFonts.poppins(
                    fontSize: 12,
                    color: Colors.blue[700],
                  ),
                ),
              ],
            ),
          ),
          
          const SizedBox(height: 24),
          
          // Document list
          ..._requiredDocuments.map((doc) => _buildDocumentCard(doc)).toList(),
          
          const SizedBox(height: 24),
          
          // Submit button
          if (_areAllRequiredDocumentsUploaded())
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _isLoading ? null : _submitDocuments,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFFE53E3E),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
                child: _isLoading
                    ? const CircularProgressIndicator(
                        valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                      )
                    : Text(
                        'Enviar para Verificação',
                        style: GoogleFonts.poppins(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildDocumentCard(RequiredDocument doc) {
    final uploadedDoc = _uploadedDocuments
        .where((d) => d.type == doc.type)
        .firstOrNull;

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  doc.required ? Icons.priority_high : Icons.description,
                  color: doc.required ? const Color(0xFFE53E3E) : Colors.grey[600],
                  size: 24,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        doc.title,
                        style: GoogleFonts.poppins(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          color: const Color(0xFF2D3748),
                        ),
                      ),
                      Text(
                        doc.description,
                        style: GoogleFonts.poppins(
                          fontSize: 14,
                          color: const Color(0xFF718096),
                        ),
                      ),
                    ],
                  ),
                ),
                if (uploadedDoc != null)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: Colors.green[100],
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      'Enviado',
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        color: Colors.green[700],
                        fontWeight: FontWeight.w600,
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
                  border: Border.all(color: Colors.green[200] ?? Colors.green),
                ),
                child: Row(
                  children: [
                    Icon(Icons.check_circle, color: Colors.green[600]),
                    SizedBox(width: 8),
                    Text(
                      'Enviado em ${uploadedDoc.uploadDate}',
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.green[700],
                      ),
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
                  border: Border.all(color: Colors.grey[200] ?? Colors.grey),
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
            
            if (uploadedDoc == null) ...[
              SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => _selectImage(doc),
                      style: OutlinedButton.styleFrom(
                        side: const BorderSide(color: Color(0xFFE53E3E)),
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                      child: Text(
                        'Galeria',
                        style: GoogleFonts.poppins(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: const Color(0xFFE53E3E),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () => _takePhoto(doc),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFFE53E3E),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                      child: Text(
                        'Câmera',
                        style: GoogleFonts.poppins(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _selectImage(RequiredDocument document) async {
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
        SnackBar(content: Text('Erro ao selecionar imagem')),
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
        SnackBar(content: Text('Erro ao tirar foto')),
      );
    }
  }

  Future<void> _uploadDocument(XFile file, RequiredDocument document) async {
    setState(() => _isLoading = true);

    try {
      final response = await ApiService.uploadDocument(
        file: file,
        documentType: document.type,
        userType: widget.userType,
        partnerType: widget.partnerType,
      );

      if (response['success']) {
        final newDocument = Document.fromJson(response['data']);
        setState(() {
          _uploadedDocuments.add(newDocument);
        });
        
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Documento enviado com sucesso')),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(response['message'] ?? 'Erro ao enviar documento')),
        );
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Erro ao enviar documento')),
      );
    } finally {
      setState(() => _isLoading = false);
    }
  }

  bool _areAllRequiredDocumentsUploaded() {
    for (final doc in _requiredDocuments) {
      if (doc.required) {
        final hasDocument = _uploadedDocuments.any(
          (uploaded) => uploaded.type == doc.type,
        );
        if (!hasDocument) return false;
      }
    }
    return true;
  }

  Future<void> _submitDocuments() async {
    try {
      // Simulate submission
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Documentos enviados para verificação')),
      );
      
      Navigator.pop(context);
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Erro ao enviar documentos')),
      );
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
