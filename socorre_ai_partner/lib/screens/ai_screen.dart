import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../models/ai_models.dart';
import '../services/ai_service.dart';
import '../widgets/ai_model_card.dart';

class AIScreen extends StatefulWidget {
  const AIScreen({super.key});

  @override
  State<AIScreen> createState() => _AIScreenState();
}

class _AIScreenState extends State<AIScreen> {
  List<AIModel> _models = [];
  List<Prediction> _predictions = [];
  List<AIInsight> _insights = [];
  bool _isLoading = true;
  String _error = '';
  int _selectedTab = 0;
  String? _selectedCategory;

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
      
      // Carregar modelos
      final modelsResult = await AIService.getAIModels(
        token: token,
        category: _selectedCategory,
      );
      if (modelsResult['success']) {
        setState(() {
          _models = modelsResult['data'];
        });
      }

      // Carregar predições
      final predictionsResult = await AIService.getPredictions(token: token);
      if (predictionsResult['success']) {
        setState(() {
          _predictions = predictionsResult['data'];
        });
      }

      // Carregar insights
      final insightsResult = await AIService.getAIInsights(token: token);
      if (insightsResult['success']) {
        setState(() {
          _insights = insightsResult['data'];
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
          'Inteligência Artificial',
          style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
        ),
        centerTitle: true,
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: _createModel,
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
                          ? _buildModelsTab()
                          : _selectedTab == 1
                              ? _buildPredictionsTab()
                              : _buildInsightsTab(),
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
            child: _buildTabButton('Modelos', 0),
          ),
          Expanded(
            child: _buildTabButton('Predições', 1),
          ),
          Expanded(
            child: _buildTabButton('Insights', 2),
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
              items: const [
                DropdownMenuItem<String>(
                  value: null,
                  child: Text('Todas'),
                ),
                DropdownMenuItem<String>(
                  value: 'prediction',
                  child: Text('Predição'),
                ),
                DropdownMenuItem<String>(
                  value: 'classification',
                  child: Text('Classificação'),
                ),
                DropdownMenuItem<String>(
                  value: 'recommendation',
                  child: Text('Recomendação'),
                ),
                DropdownMenuItem<String>(
                  value: 'optimization',
                  child: Text('Otimização'),
                ),
              ],
              onChanged: (value) {
                setState(() {
                  _selectedCategory = value;
                });
                _loadData();
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildModelsTab() {
    return RefreshIndicator(
      onRefresh: _onRefresh,
      color: const Color(0xFFE53E3E),
      child: _models.isEmpty
          ? _buildEmptyModels()
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: _models.length,
              itemBuilder: (context, index) {
                final model = _models[index];
                return AIModelCard(
                  model: model,
                  onTap: () => _openModel(model),
                  onTrain: () => _trainModel(model),
                  onToggle: () => _toggleModel(model),
                  onDelete: () => _deleteModel(model),
                );
              },
            ),
    );
  }

  Widget _buildPredictionsTab() {
    return RefreshIndicator(
      onRefresh: _onRefresh,
      color: const Color(0xFFE53E3E),
      child: _predictions.isEmpty
          ? _buildEmptyPredictions()
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: _predictions.length,
              itemBuilder: (context, index) {
                final prediction = _predictions[index];
                return PredictionCard(
                  prediction: prediction,
                  onTap: () => _openPrediction(prediction),
                );
              },
            ),
    );
  }

  Widget _buildInsightsTab() {
    return RefreshIndicator(
      onRefresh: _onRefresh,
      color: const Color(0xFFE53E3E),
      child: _insights.isEmpty
          ? _buildEmptyInsights()
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: _insights.length,
              itemBuilder: (context, index) {
                final insight = _insights[index];
                return AIInsightCard(
                  insight: insight,
                  onTap: () => _openInsight(insight),
                );
              },
            ),
    );
  }

  Widget _buildEmptyModels() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.psychology_outlined,
            size: 64,
            color: Colors.grey[400],
          ),
          const SizedBox(height: 16),
          Text(
            'Nenhum modelo de IA encontrado',
            style: GoogleFonts.poppins(
              fontSize: 18,
              color: Colors.grey[600],
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Crie seu primeiro modelo de IA para começar',
            style: GoogleFonts.poppins(
              fontSize: 14,
              color: Colors.grey[500],
            ),
          ),
          const SizedBox(height: 24),
          ElevatedButton.icon(
            onPressed: _createModel,
            icon: const Icon(Icons.add),
            label: const Text('Criar Modelo'),
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

  Widget _buildEmptyPredictions() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.analytics_outlined,
            size: 64,
            color: Colors.grey[400],
          ),
          const SizedBox(height: 16),
          Text(
            'Nenhuma predição encontrada',
            style: GoogleFonts.poppins(
              fontSize: 18,
              color: Colors.grey[600],
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Faça predições usando seus modelos de IA',
            style: GoogleFonts.poppins(
              fontSize: 14,
              color: Colors.grey[500],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyInsights() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.lightbulb_outline,
            size: 64,
            color: Colors.grey[400],
          ),
          const SizedBox(height: 16),
          Text(
            'Nenhum insight encontrado',
            style: GoogleFonts.poppins(
              fontSize: 18,
              color: Colors.grey[600],
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Insights de IA serão gerados automaticamente',
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
            'Erro ao carregar IA',
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

  void _createModel() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF2A2A2A),
        title: Text(
          'Criar Modelo de IA',
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

  void _openModel(AIModel model) {
    // Implementar abertura do modelo
    Navigator.pushNamed(context, '/ai/model', arguments: model);
  }

  void _trainModel(AIModel model) {
    // Implementar treinamento do modelo
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Treinamento do modelo iniciado')),
    );
  }

  void _toggleModel(AIModel model) {
    // Implementar ativar/desativar modelo
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Status do modelo alterado')),
    );
  }

  void _deleteModel(AIModel model) {
    // Implementar exclusão do modelo
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Modelo excluído')),
    );
  }

  void _openPrediction(Prediction prediction) {
    // Implementar abertura da predição
    Navigator.pushNamed(context, '/ai/prediction', arguments: prediction);
  }

  void _openInsight(AIInsight insight) {
    // Implementar abertura do insight
    Navigator.pushNamed(context, '/ai/insight', arguments: insight);
  }
}
