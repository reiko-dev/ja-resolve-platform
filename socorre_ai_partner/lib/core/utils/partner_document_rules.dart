import 'partner_type_utils.dart';

class PartnerDocumentDefinition {
  final String type;
  final String title;
  final String description;
  final bool required;

  const PartnerDocumentDefinition({
    required this.type,
    required this.title,
    required this.description,
    required this.required,
  });
}

class PartnerDocumentRules {
  static const String rgCpf = 'rg_cpf';
  static const String cnh = 'cnh';
  static const String crlv = 'crlv';
  static const String cnpj = 'cnpj';
  static const String addressProof = 'address_proof';
  static const String businessLicense = 'business_license';
  static const String certification = 'certification';
  static const String workshopPhotos = 'workshop_photos';
  static const String vehiclePhotos = 'vehicle_photos';
  static const String insurancePolicy = 'insurance_policy';
  static const String environmentalLicense = 'environmental_license';
  static const String fireSafety = 'fire_safety';
  static const String stationPhotos = 'station_photos';
  static const String storePhotos = 'store_photos';
  static const String inventoryPhotos = 'inventory_photos';
  static const String towPhotos = 'tow_photos';

  static List<PartnerDocumentDefinition> getAll(String partnerType) {
    switch (PartnerTypeUtils.normalize(partnerType)) {
      case PartnerTypeUtils.mechanic:
        return const [
          PartnerDocumentDefinition(
            type: rgCpf,
            title: 'RG, CPF ou CNH',
            description: 'Documento de identificação com foto do responsável',
            required: true,
          ),
          PartnerDocumentDefinition(
            type: addressProof,
            title: 'Comprovante de Residência',
            description: 'Conta de luz, água ou telefone',
            required: true,
          ),
        ];
      case PartnerTypeUtils.motoboy:
        return const [
          PartnerDocumentDefinition(
            type: rgCpf,
            title: 'RG ou CPF',
            description: 'Documento de identidade com foto',
            required: true,
          ),
          PartnerDocumentDefinition(
            type: cnh,
            title: 'CNH',
            description: 'Carteira Nacional de Habilitação',
            required: true,
          ),
          PartnerDocumentDefinition(
            type: crlv,
            title: 'CRLV',
            description: 'Documento do veículo',
            required: true,
          ),
          PartnerDocumentDefinition(
            type: addressProof,
            title: 'Comprovante de Residência',
            description: 'Conta de luz, água ou telefone',
            required: true,
          ),
        ];
      case PartnerTypeUtils.tow:
        return const [
          PartnerDocumentDefinition(
            type: rgCpf,
            title: 'RG ou CPF',
            description: 'Documento de identidade com foto',
            required: true,
          ),
          PartnerDocumentDefinition(
            type: cnh,
            title: 'CNH',
            description: 'Carteira Nacional de Habilitação adequada',
            required: true,
          ),
          PartnerDocumentDefinition(
            type: crlv,
            title: 'CRLV',
            description: 'Documento do guincho',
            required: true,
          ),
          PartnerDocumentDefinition(
            type: addressProof,
            title: 'Comprovante de Residência',
            description: 'Conta de luz, água ou telefone',
            required: true,
          ),
        ];
      case PartnerTypeUtils.gasStation:
        return const [
          PartnerDocumentDefinition(
            type: rgCpf,
            title: 'RG ou CPF do Responsável',
            description: 'Documento do responsável pelo posto',
            required: true,
          ),
          PartnerDocumentDefinition(
            type: cnpj,
            title: 'Cartão CNPJ',
            description: 'Comprovante de inscrição do CNPJ',
            required: true,
          ),
          PartnerDocumentDefinition(
            type: businessLicense,
            title: 'Alvará de Funcionamento',
            description: 'Licença municipal de funcionamento',
            required: true,
          ),
          PartnerDocumentDefinition(
            type: addressProof,
            title: 'Comprovante de Endereço',
            description: 'Comprovante do endereço comercial',
            required: true,
          ),
        ];
      case PartnerTypeUtils.autoParts:
        return const [
          PartnerDocumentDefinition(
            type: rgCpf,
            title: 'RG ou CPF do Responsável',
            description: 'Documento do responsável pela loja',
            required: true,
          ),
          PartnerDocumentDefinition(
            type: cnpj,
            title: 'Cartão CNPJ',
            description: 'Comprovante de inscrição do CNPJ',
            required: true,
          ),
          PartnerDocumentDefinition(
            type: businessLicense,
            title: 'Alvará de Funcionamento',
            description: 'Licença municipal de funcionamento',
            required: true,
          ),
          PartnerDocumentDefinition(
            type: addressProof,
            title: 'Comprovante de Endereço',
            description: 'Comprovante do endereço comercial',
            required: true,
          ),
        ];
      default:
        return const [];
    }
  }

  static List<String> getRequiredTypes(String partnerType) {
    return getAll(partnerType)
        .where((document) => document.required)
        .map((document) => document.type)
        .toList();
  }

  static bool requiresDocuments(String partnerType) {
    return getRequiredTypes(partnerType).isNotEmpty;
  }

  static String normalizeDocumentType(String documentType) {
    switch (documentType) {
      case 'cpf':
      case 'identidade':
        return rgCpf;
      case 'vehicle_document':
        return crlv;
      case 'residence_proof':
        return addressProof;
      default:
        return documentType;
    }
  }

  static bool matchesType(String left, String right) {
    return normalizeDocumentType(left) == normalizeDocumentType(right);
  }
}
