class MechanicSpecialty {
  final String id;
  final String name;
  final String category;
  final String description;

  MechanicSpecialty({
    required this.id,
    required this.name,
    required this.category,
    required this.description,
  });

  // Lista completa de especialidades
  static List<MechanicSpecialty> getAllSpecialties() {
    return [
      // 🔧 Mecânica Geral
      MechanicSpecialty(
        id: 'mecanica_geral',
        name: 'Mecânica Geral',
        category: 'Mecânica Geral',
        description: 'Reparos gerais e manutenção preventiva',
      ),
      MechanicSpecialty(
        id: 'motor_retifica',
        name: 'Motor (Reparo e Retífica)',
        category: 'Mecânica Geral',
        description: 'Reparo completo de motor e retífica de componentes',
      ),
      MechanicSpecialty(
        id: 'injecao_eletronica',
        name: 'Injeção Eletrônica',
        category: 'Mecânica Geral',
        description: 'Diagnóstico e reparo de sistemas de injeção',
      ),
      MechanicSpecialty(
        id: 'diagnostico_eletronico',
        name: 'Diagnóstico Eletrônico',
        category: 'Mecânica Geral',
        description: 'Diagnóstico com scanners e equipamentos eletrônicos',
      ),
      MechanicSpecialty(
        id: 'oleo_filtros',
        name: 'Troca de Óleo e Filtros',
        category: 'Mecânica Geral',
        description: 'Troca de óleo, filtros e lubrificação',
      ),
      MechanicSpecialty(
        id: 'arrefecimento',
        name: 'Sistema de Arrefecimento',
        category: 'Mecânica Geral',
        description: 'Reparo em sistema de arrefecimento e radiador',
      ),
      MechanicSpecialty(
        id: 'embreagem',
        name: 'Embreagem',
        category: 'Mecânica Geral',
        description: 'Reparo e substituição de sistema de embreagem',
      ),
      MechanicSpecialty(
        id: 'cambio_manual',
        name: 'Câmbio Manual',
        category: 'Mecânica Geral',
        description: 'Reparo em transmissões manuais',
      ),
      MechanicSpecialty(
        id: 'cambio_automatico',
        name: 'Câmbio Automático',
        category: 'Mecânica Geral',
        description: 'Reparo em transmissões automáticas',
      ),

      // ⚡ Elétrica & Eletrônica
      MechanicSpecialty(
        id: 'eletrica_automotiva',
        name: 'Elétrica Automotiva',
        category: 'Elétrica & Eletrônica',
        description: 'Instalação e reparo de sistemas elétricos',
      ),
      MechanicSpecialty(
        id: 'alternador',
        name: 'Alternador',
        category: 'Elétrica & Eletrônica',
        description: 'Reparo e substituição de alternador',
      ),
      MechanicSpecialty(
        id: 'motor_partida',
        name: 'Motor de Partida',
        category: 'Elétrica & Eletrônica',
        description: 'Reparo e substituição de motor de partida',
      ),
      MechanicSpecialty(
        id: 'bateria',
        name: 'Bateria',
        category: 'Elétrica & Eletrônica',
        description: 'Teste e substituição de baterias',
      ),
      MechanicSpecialty(
        id: 'chicote_eletrico',
        name: 'Chicote Elétrico',
        category: 'Elétrica & Eletrônica',
        description: 'Conserto e confecção de chicotes elétricos',
      ),
      MechanicSpecialty(
        id: 'modulos_eletronicos',
        name: 'Módulos Eletrônicos',
        category: 'Elétrica & Eletrônica',
        description: 'Reparo e programação de módulos',
      ),
      MechanicSpecialty(
        id: 'scanner_automotivo',
        name: 'Scanner Automotivo',
        category: 'Elétrica & Eletrônica',
        description: 'Diagnóstico com scanners profissionais',
      ),
      MechanicSpecialty(
        id: 'instalacao_acessorios',
        name: 'Instalação de Acessórios',
        category: 'Elétrica & Eletrônica',
        description: 'Instalação de alarmes, som e acessórios',
      ),

      // 🚗 Suspensão, Freios e Direção
      MechanicSpecialty(
        id: 'suspensao',
        name: 'Suspensão',
        category: 'Suspensão, Freios e Direção',
        description: 'Reparo em sistema de suspensão',
      ),
      MechanicSpecialty(
        id: 'amortecedores',
        name: 'Amortecedores',
        category: 'Suspensão, Freios e Direção',
        description: 'Substituição de amortecedores',
      ),
      MechanicSpecialty(
        id: 'freios_disco',
        name: 'Freios (Disco, Tambor, ABS)',
        category: 'Suspensão, Freios e Direção',
        description: 'Reparo completo sistema de freios',
      ),
      MechanicSpecialty(
        id: 'alinhamento',
        name: 'Alinhamento',
        category: 'Suspensão, Freios e Direção',
        description: 'Alinhamento de direção e balanceamento',
      ),
      MechanicSpecialty(
        id: 'balanceamento',
        name: 'Balanceamento',
        category: 'Suspensão, Freios e Direção',
        description: 'Balanceamento de rodas',
      ),
      MechanicSpecialty(
        id: 'direcao_hidraulica',
        name: 'Direção Hidráulica',
        category: 'Suspensão, Freios e Direção',
        description: 'Reparo em sistema de direção hidráulica',
      ),
      MechanicSpecialty(
        id: 'direcao_eletrica',
        name: 'Direção Elétrica',
        category: 'Suspensão, Freios e Direção',
        description: 'Reparo em sistema de direção elétrica',
      ),

      // ❄️ Conforto & Climatização
      MechanicSpecialty(
        id: 'ar_condicionado',
        name: 'Ar-Condicionado Automotivo',
        category: 'Conforto & Climatização',
        description: 'Instalação e reparo de ar-condicionado',
      ),
      MechanicSpecialty(
        id: 'higienizacao_ar',
        name: 'Higienização de Ar',
        category: 'Conforto & Climatização',
        description: 'Higienização do sistema de ar-condicionado',
      ),
      MechanicSpecialty(
        id: 'ventilacao',
        name: 'Sistema de Ventilação',
        category: 'Conforto & Climatização',
        description: 'Reparo em sistema de ventilação',
      ),
      MechanicSpecialty(
        id: 'reparo_painel',
        name: 'Reparo de Painel',
        category: 'Conforto & Climatização',
        description: 'Reparo em painel de controle climático',
      ),

      // 🛠 Especializações
      MechanicSpecialty(
        id: 'mecanico_diesel',
        name: 'Mecânico Diesel',
        category: 'Especializações',
        description: 'Especialista em motores diesel',
      ),
      MechanicSpecialty(
        id: 'mecanico_motos',
        name: 'Mecânico de Motos',
        category: 'Especializações',
        description: 'Reparos em motocicletas',
      ),
      MechanicSpecialty(
        id: 'mecanico_caminhoes',
        name: 'Mecânico de Caminhões',
        category: 'Especializações',
        description: 'Reparos em veículos pesados',
      ),
      MechanicSpecialty(
        id: 'preparacao_performance',
        name: 'Preparação / Performance',
        category: 'Especializações',
        description: 'Preparação de motores para performance',
      ),
      MechanicSpecialty(
        id: 'turbo',
        name: 'Turbo',
        category: 'Especializações',
        description: 'Instalação e reparo de turbo',
      ),
      MechanicSpecialty(
        id: 'gnv',
        name: 'GNV',
        category: 'Especializações',
        description: 'Instalação e manutenção de GNV',
      ),
      MechanicSpecialty(
        id: 'mecanica_nautica',
        name: 'Mecânica Náutica',
        category: 'Especializações',
        description: 'Reparos em motores náuticos',
      ),
      MechanicSpecialty(
        id: 'mecanica_agricola',
        name: 'Mecânica Agrícola',
        category: 'Especializações',
        description: 'Reparos em máquinas agrícolas',
      ),

      // 🧰 Serviços Rápidos
      MechanicSpecialty(
        id: 'troca_pneus',
        name: 'Troca de Pneus',
        category: 'Serviços Rápidos',
        description: 'Troca e balanceamento de pneus',
      ),
      MechanicSpecialty(
        id: 'borracharia',
        name: 'Borracharia',
        category: 'Serviços Rápidos',
        description: 'Conserto e vulcanização de pneus',
      ),
      MechanicSpecialty(
        id: 'chaveiro_automotivo',
        name: 'Chaveiro Automotivo',
        category: 'Serviços Rápidos',
        description: 'Confecção de chaves e imobilizadores',
      ),
      MechanicSpecialty(
        id: 'socorro_mecanico',
        name: 'Socorro Mecânico',
        category: 'Serviços Rápidos',
        description: 'Atendimento emergencial 24h',
      ),
      MechanicSpecialty(
        id: 'atendimento_domiciliar',
        name: 'Atendimento Domiciliar',
        category: 'Serviços Rápidos',
        description: 'Reparos em domicílio',
      ),
    ];
  }

  // Buscar especialidades por categoria
  static List<MechanicSpecialty> getByCategory(String category) {
    return getAllSpecialties()
        .where((specialty) => specialty.category == category)
        .toList();
  }

  // Buscar especialidade por ID
  static MechanicSpecialty? getById(String id) {
    try {
      return getAllSpecialties().firstWhere((specialty) => specialty.id == id);
    } catch (e) {
      return null;
    }
  }

  // Lista de categorias
  static List<String> getCategories() {
    return [
      'Mecânica Geral',
      'Elétrica & Eletrônica',
      'Suspensão, Freios e Direção',
      'Conforto & Climatização',
      'Especializações',
      'Serviços Rápidos',
    ];
  }
}
