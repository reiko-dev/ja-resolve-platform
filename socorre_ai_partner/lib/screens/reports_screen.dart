import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../models/reports.dart';
import '../services/reports_service.dart';
import '../widgets/report_card.dart';

class ReportsScreen extends StatefulWidget {
  const ReportsScreen({super.key});

  @override
  State<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends State<ReportsScreen> {
  List<Report> _reports = [];
  List<ReportTemplate> _templates = [];
  List<ReportCategory> _categories = [];
  bool _isLoading = true;
  String _error = '';
  int _selectedTab = 0;
  String? _selectedCategory;
  String? _selectedType;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() {
      _isLoading = true;
      _error = '';
    });

    try {
      final token = 'fake_token';
      
      // Carregar relatórios
      final reportsResult = await ReportsService.getUserReports(
        token: token,
        category: _selectedCategory,
        type: _selectedType,
      );
      if (reportsResult['success']) {
        setState(() {
          _reports = reportsResult['data'];
        });
      }

      // Carregar templates
      final templatesResult = await ReportsService.getReportTemplates(
        token: token,
        category: _selectedCategory,
      );
      if (templatesResult['success']) {
        setState(() {
          _templates = templatesResult['data'];
        });
      }

      // Carregar categorias
      final categoriesResult = await ReportsService.getReportCategories(token: token);
      if (categoriesResult['success']) {
        setState(() {
          _categories = categoriesResult['data'];
        });
      }

    } catch (e) {
      setState(() {
        _error = 'Erro ao carregar dados: $e';
      });
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  Future<void> _onRefresh() async {
    _loadData();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF1A1A1A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1A1A1A),
        foregroundColor: Colors.white,
        title: Text(
          'Relatórios',
          style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
        ),
        centerTitle: true,
        actions: [
          IconButton(
            icon: const Icon(Icons.filter_list),
            onPressed: _showFilters,
          ),
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: _createReport,
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
              : Column(
                  children: [
                    // Tabs
                    _buildTabs(),
                    
                    // Filtros
                    if (_selectedTab == 0) _buildFilters(),
                    
                    // Conteúdo
                    Expanded(
                      child: _selectedTab == 0
                          ? _buildReportsTab()
                          : _buildTemplatesTab(),
                    ),
                  ],
                ),
    );
  }

  Widget _buildTabs() {
    return Container(
      margin: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF2A2A2A),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Expanded(
            child: _buildTabButton('Meus Relatórios', 0),
          ),
          Expanded(
            child: _buildTabButton('Templates', 1),
          ),
        ],
      ),
    );
  }

  Widget _buildTabButton(String title, int index) {
    final isSelected = _selectedTab == index;
    return InkWell(
      onTap: () => setState(() => _selectedTab = index),
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: isSelected ? const Color(0xFFE53E3E) : Colors.transparent,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(
          title,
          style: GoogleFonts.poppins(
            fontSize: 14,
            fontWeight: FontWeight.w600,
            color: isSelected ? Colors.white : Colors.grey[400],
          ),
          textAlign: TextAlign.center,
        ),
      ),
    );
  }

  Widget _buildFilters() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF2A2A2A),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Expanded(
            child: DropdownButton<String>(
              value: _selectedCategory,
              hint: Text(
                'Categoria',
                style: GoogleFonts.poppins(color: Colors.white70),
              ),
              dropdownColor: const Color(0xFF2A2A2A),
              style: GoogleFonts.poppins(color: Colors.white),
              items: [
                const DropdownMenuItem<String>(
                  value: null,
                  child: Text('Todas'),
                ),
                ..._categories.map((category) => DropdownMenuItem<String>(
                  value: category.id,
                  child: Text(category.name),
                )),
              ],
              onChanged: (value) {
                setState(() {
                  _selectedCategory = value;
                });
                _loadData();
              },
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: DropdownButton<String>(
              value: _selectedType,
              hint: Text(
                'Tipo',
                style: GoogleFonts.poppins(color: Colors.white70),
              ),
              dropdownColor: const Color(0xFF2A2A2A),
              style: GoogleFonts.poppins(color: Colors.white),
              items: const [
                DropdownMenuItem<String>(
                  value: null,
                  child: Text('Todos'),
                ),
                DropdownMenuItem<String>(
                  value: 'financial',
                  child: Text('Financeiro'),
                ),
                DropdownMenuItem<String>(
                  value: 'operational',
                  child: Text('Operacional'),
                ),
                DropdownMenuItem<String>(
                  value: 'customer',
                  child: Text('Cliente'),
                ),
                DropdownMenuItem<String>(
                  value: 'performance',
                  child: Text('Performance'),
                ),
              ],
              onChanged: (value) {
                setState(() {
                  _selectedType = value;
                });
                _loadData();
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildReportsTab() {
    return RefreshIndicator(
      onRefresh: _onRefresh,
      color: const Color(0xFFE53E3E),
      child: _reports.isEmpty
          ? _buildEmptyReports()
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: _reports.length,
              itemBuilder: (context, index) {
                final report = _reports[index];
                return ReportCard(
                  report: report,
                  onTap: () => _openReport(report),
                  onDownload: () => _downloadReport(report),
                  onDelete: () => _deleteReport(report),
                );
              },
            ),
    );
  }

  Widget _buildTemplatesTab() {
    return RefreshIndicator(
      onRefresh: _onRefresh,
      color: const Color(0xFFE53E3E),
      child: _templates.isEmpty
          ? _buildEmptyTemplates()
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: _templates.length,
              itemBuilder: (context, index) {
                final template = _templates[index];
                return ReportTemplateCard(
                  template: template,
                  onTap: () => _useTemplate(template),
                );
              },
            ),
    );
  }

  Widget _buildEmptyReports() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.assessment_outlined,
            size: 64,
            color: Colors.grey[400],
          ),
          const SizedBox(height: 16),
          Text(
            'Nenhum relatório encontrado',
            style: GoogleFonts.poppins(
              fontSize: 18,
              color: Colors.grey[600],
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Crie seu primeiro relatório para visualizar dados',
            style: GoogleFonts.poppins(
              fontSize: 14,
              color: Colors.grey[500],
            ),
          ),
          const SizedBox(height: 24),
          ElevatedButton.icon(
            onPressed: _createReport,
            icon: const Icon(Icons.add),
            label: const Text('Criar Relatório'),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFE53E3E),
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyTemplates() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.description_outlined,
            size: 64,
            color: Colors.grey[400],
          ),
          const SizedBox(height: 16),
          Text(
            'Nenhum template encontrado',
            style: GoogleFonts.poppins(
              fontSize: 18,
              color: Colors.grey[600],
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Templates de relatório serão disponibilizados em breve',
            style: GoogleFonts.poppins(
              fontSize: 14,
              color: Colors.grey[500],
            ),
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
            'Erro ao carregar relatórios',
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
            onPressed: _onRefresh,
            child: const Text('Tentar novamente'),
          ),
        ],
      ),
    );
  }

  void _showFilters() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF2A2A2A),
        title: Text(
          'Filtros',
          style: GoogleFonts.poppins(
            color: Colors.white,
            fontWeight: FontWeight.bold,
          ),
        ),
        content: Text(
          'Funcionalidade em desenvolvimento',
          style: GoogleFonts.poppins(color: Colors.white70),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(
              'Fechar',
              style: GoogleFonts.poppins(
                color: const Color(0xFFE53E3E),
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _createReport() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF2A2A2A),
        title: Text(
          'Criar Relatório',
          style: GoogleFonts.poppins(
            color: Colors.white,
            fontWeight: FontWeight.bold,
          ),
        ),
        content: Text(
          'Funcionalidade em desenvolvimento',
          style: GoogleFonts.poppins(color: Colors.white70),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(
              'Fechar',
              style: GoogleFonts.poppins(
                color: const Color(0xFFE53E3E),
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _openReport(Report report) {
    // Implementar abertura do relatório
    Navigator.pushNamed(context, '/reports/details', arguments: report);
  }

  void _downloadReport(Report report) {
    // Implementar download do relatório
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Download do relatório iniciado')),
    );
  }

  void _deleteReport(Report report) {
    // Implementar exclusão do relatório
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Relatório excluído')),
    );
  }

  void _useTemplate(ReportTemplate template) {
    // Implementar uso do template
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Template selecionado')),
    );
  }
}
