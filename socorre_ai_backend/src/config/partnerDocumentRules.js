const CANONICAL_PARTNER_TYPES = {
  mechanic: 'mechanic',
  motoboy: 'motoboy',
  gas_station: 'gas_station',
  auto_parts: 'auto_parts',
  tow: 'tow',
};

const PARTNER_TYPE_ALIASES = {
  gasstation: CANONICAL_PARTNER_TYPES.gas_station,
  store: CANONICAL_PARTNER_TYPES.gas_station,
  autoparts: CANONICAL_PARTNER_TYPES.auto_parts,
  towtruck: CANONICAL_PARTNER_TYPES.tow,
  tow_truck: CANONICAL_PARTNER_TYPES.tow,
  guincho: CANONICAL_PARTNER_TYPES.tow,
  delivery: CANONICAL_PARTNER_TYPES.motoboy,
};

const DOCUMENT_TYPE_ALIASES = {
  cpf: 'rg_cpf',
  identidade: 'rg_cpf',
  vehicle_document: 'crlv',
  residence_proof: 'address_proof',
};

const DOCUMENT_RULES = {
  [CANONICAL_PARTNER_TYPES.mechanic]: [
    {
      type: 'rg_cpf',
      title: 'RG, CPF ou CNH',
      required: true,
    },
    {
      type: 'address_proof',
      title: 'Comprovante de Residência',
      required: true,
    },
  ],
  [CANONICAL_PARTNER_TYPES.motoboy]: [
    {
      type: 'rg_cpf',
      title: 'RG ou CPF',
      required: true,
    },
    {
      type: 'cnh',
      title: 'CNH',
      required: true,
    },
    {
      type: 'crlv',
      title: 'CRLV',
      required: true,
    },
    {
      type: 'address_proof',
      title: 'Comprovante de Residência',
      required: true,
    },
  ],
  [CANONICAL_PARTNER_TYPES.tow]: [
    {
      type: 'rg_cpf',
      title: 'RG ou CPF',
      required: true,
    },
    {
      type: 'cnh',
      title: 'CNH',
      required: true,
    },
    {
      type: 'crlv',
      title: 'CRLV',
      required: true,
    },
    {
      type: 'address_proof',
      title: 'Comprovante de Residência',
      required: true,
    },
  ],
  [CANONICAL_PARTNER_TYPES.gas_station]: [
    {
      type: 'rg_cpf',
      title: 'RG ou CPF do Responsável',
      required: true,
    },
    {
      type: 'cnpj',
      title: 'Cartão CNPJ',
      required: true,
    },
    {
      type: 'business_license',
      title: 'Alvará de Funcionamento',
      required: true,
    },
    {
      type: 'address_proof',
      title: 'Comprovante de Endereço',
      required: true,
    },
  ],
  [CANONICAL_PARTNER_TYPES.auto_parts]: [
    {
      type: 'rg_cpf',
      title: 'RG ou CPF do Responsável',
      required: true,
    },
    {
      type: 'cnpj',
      title: 'Cartão CNPJ',
      required: true,
    },
    {
      type: 'business_license',
      title: 'Alvará de Funcionamento',
      required: true,
    },
    {
      type: 'address_proof',
      title: 'Comprovante de Endereço',
      required: true,
    },
  ],
};

function normalizePartnerType(partnerType) {
  if (!partnerType) {
    return '';
  }

  return PARTNER_TYPE_ALIASES[partnerType] || partnerType;
}

function normalizeDocumentType(documentType) {
  if (!documentType) {
    return '';
  }

  return DOCUMENT_TYPE_ALIASES[documentType] || documentType;
}

function getAllDocuments(partnerType) {
  return DOCUMENT_RULES[normalizePartnerType(partnerType)] || [];
}

function getRequiredDocuments(partnerType) {
  return getAllDocuments(partnerType)
    .filter((document) => document.required)
    .map((document) => document.type);
}

function requiresDocuments(partnerType) {
  return getRequiredDocuments(partnerType).length > 0;
}

function determineDocumentTypeFromFilename(filename) {
  const lowerFilename = (filename || '').toLowerCase();

  if (lowerFilename.includes('cpf') || lowerFilename.includes('rg') || lowerFilename.includes('identidade')) {
    return 'rg_cpf';
  }
  if (lowerFilename.includes('cnpj')) {
    return 'cnpj';
  }
  if (lowerFilename.includes('cnh') || lowerFilename.includes('habilitacao')) {
    return 'cnh';
  }
  if (lowerFilename.includes('crlv') || lowerFilename.includes('veiculo') || lowerFilename.includes('vehicle_document')) {
    return 'crlv';
  }
  if (
    lowerFilename.includes('residencia') ||
    lowerFilename.includes('endereco') ||
    lowerFilename.includes('comprovante') ||
    lowerFilename.includes('address_proof') ||
    lowerFilename.includes('residence_proof')
  ) {
    return 'address_proof';
  }
  if (lowerFilename.includes('certificado') || lowerFilename.includes('certification')) {
    return 'certification';
  }
  if (lowerFilename.includes('licenca') || lowerFilename.includes('alvara') || lowerFilename.includes('business_license')) {
    return 'business_license';
  }
  if (lowerFilename.includes('ambiental')) {
    return 'environmental_license';
  }
  if (lowerFilename.includes('bombeiro') || lowerFilename.includes('incendio') || lowerFilename.includes('fire')) {
    return 'fire_safety';
  }
  if (lowerFilename.includes('seguro') || lowerFilename.includes('insurance')) {
    return 'insurance_policy';
  }

  return 'other';
}

module.exports = {
  normalizePartnerType,
  normalizeDocumentType,
  getAllDocuments,
  getRequiredDocuments,
  requiresDocuments,
  determineDocumentTypeFromFilename,
  CANONICAL_PARTNER_TYPES,
};
