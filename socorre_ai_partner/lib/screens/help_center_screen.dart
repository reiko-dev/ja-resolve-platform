import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../models/support.dart';
import '../services/support_service.dart';
import '../widgets/help_article_card.dart';
import '../widgets/faq_card.dart';

class HelpCenterScreen extends StatefulWidget {
  const HelpCenterScreen({super.key});

  @override
  State<HelpCenterScreen> createState() => _HelpCenterScreenState();
}

class _HelpCenterScreenState extends State<HelpCenterScreen> {
  List<HelpArticle> _articles = [];
  List<FAQ> _faqs = [];
  List<HelpCategory> _categories = [];
  bool _isLoading = true;
  String _error = '';
  String _searchQuery = '';
  String _selectedCategory = '';
  int _selectedTab = 0;

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
      
      // Carregar artigos
      final articlesResult = await SupportService.getHelpArticles(
        token: token,
        category: _selectedCategory.isNotEmpty ? _selectedCategory : null,
        search: _searchQuery.isNotEmpty ? _searchQuery : null,
      );
      if (articlesResult['success']) {
        setState(() {
          _articles = articlesResult['data'];
        });
      }

      // Carregar FAQs
      final faqsResult = await SupportService.getFAQs(
        token: token,
        category: _selectedCategory.isNotEmpty ? _selectedCategory : null,
        search: _searchQuery.isNotEmpty ? _searchQuery : null,
      );
      if (faqsResult['success']) {
        setState(() {
          _faqs = faqsResult['data'];
        });
      }

      // Carregar categorias
      final categoriesResult = await SupportService.getHelpCategories(token: token);
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

  Future<void> _onRefresh() => _loadData();

  void _onSearch(String query) {
    setState(() {
      _searchQuery = query;
    });
    _loadData();
  }

  void _onCategoryChanged(String category) {
    setState(() {
      _selectedCategory = category;
    });
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
          'Central de Ajuda',
          style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
        ),
        centerTitle: true,
        actions: [
          IconButton(
            icon: const Icon(Icons.search),
            onPressed: _showSearchDialog,
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
                    // Filtros
                    _buildFilters(),
                    
                    // Tabs
                    _buildTabs(),
                    
                    // Conteúdo
                    Expanded(
                      child: _selectedTab == 0
                          ? _buildArticlesTab()
                          : _buildFAQsTab(),
                    ),
                  ],
                ),
    );
  }

  Widget _buildFilters() {
    return Container(
      margin: const EdgeInsets.all(16),
      child: Column(
        children: [
          // Barra de pesquisa
          TextField(
            onChanged: _onSearch,
            style: GoogleFonts.poppins(color: Colors.white),
            decoration: InputDecoration(
              hintText: 'Pesquisar ajuda...',
              hintStyle: GoogleFonts.poppins(color: Colors.grey[400]),
              prefixIcon: Icon(Icons.search, color: Colors.grey[400]),
              suffixIcon: _searchQuery.isNotEmpty
                  ? IconButton(
                      icon: Icon(Icons.clear, color: Colors.grey[400]),
                      onPressed: () => _onSearch(''),
                    )
                  : null,
              filled: true,
              fillColor: const Color(0xFF2A2A2A),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide.none,
              ),
            ),
          ),
          
          const SizedBox(height: 12),
          
          // Filtro de categoria
          if (_categories.isNotEmpty)
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  _buildCategoryChip('Todas', ''),
                  const SizedBox(width: 8),
                  ..._categories.map((category) {
                    return Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: _buildCategoryChip(category.name, category.id),
                    );
                  }),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildCategoryChip(String label, String value) {
    final isSelected = _selectedCategory == value;
    return InkWell(
      onTap: () => _onCategoryChanged(value),
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected 
              ? const Color(0xFFE53E3E)
              : const Color(0xFF2A2A2A),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: isSelected 
                ? const Color(0xFFE53E3E)
                : Colors.white12,
          ),
        ),
        child: Text(
          label,
          style: GoogleFonts.poppins(
            fontSize: 12,
            color: isSelected ? Colors.white : Colors.grey[400],
            fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
          ),
        ),
      ),
    );
  }

  Widget _buildTabs() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(
        color: const Color(0xFF2A2A2A),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Expanded(
            child: _buildTabButton('Artigos', 0),
          ),
          Expanded(
            child: _buildTabButton('FAQs', 1),
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

  Widget _buildArticlesTab() {
    return RefreshIndicator(
      onRefresh: _onRefresh,
      color: const Color(0xFFE53E3E),
      child: _articles.isEmpty
          ? _buildEmptyArticles()
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: _articles.length,
              itemBuilder: (context, index) {
                final article = _articles[index];
                return HelpArticleCard(
                  article: article,
                  onTap: () => _openArticle(article),
                );
              },
            ),
    );
  }

  Widget _buildFAQsTab() {
    return RefreshIndicator(
      onRefresh: _onRefresh,
      color: const Color(0xFFE53E3E),
      child: _faqs.isEmpty
          ? _buildEmptyFAQs()
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: _faqs.length,
              itemBuilder: (context, index) {
                final faq = _faqs[index];
                return FAQCard(
                  faq: faq,
                  onTap: () => _openFAQ(faq),
                );
              },
            ),
    );
  }

  Widget _buildEmptyArticles() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.article_outlined,
            size: 64,
            color: Colors.grey[400],
          ),
          const SizedBox(height: 16),
          Text(
            'Nenhum artigo encontrado',
            style: GoogleFonts.poppins(
              fontSize: 18,
              color: Colors.grey[600],
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Tente uma pesquisa diferente',
            style: GoogleFonts.poppins(
              fontSize: 14,
              color: Colors.grey[500],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyFAQs() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.help_outline,
            size: 64,
            color: Colors.grey[400],
          ),
          const SizedBox(height: 16),
          Text(
            'Nenhuma FAQ encontrada',
            style: GoogleFonts.poppins(
              fontSize: 18,
              color: Colors.grey[600],
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Tente uma pesquisa diferente',
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
            'Erro ao carregar ajuda',
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

  void _showSearchDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF2A2A2A),
        title: Text(
          'Pesquisar',
          style: GoogleFonts.poppins(
            color: Colors.white,
            fontWeight: FontWeight.bold,
          ),
        ),
        content: TextField(
          onChanged: _onSearch,
          style: GoogleFonts.poppins(color: Colors.white),
          decoration: InputDecoration(
            hintText: 'Digite sua pesquisa...',
            hintStyle: GoogleFonts.poppins(color: Colors.grey[400]),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: const BorderSide(color: Colors.white30),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: const BorderSide(color: Colors.white30),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: const BorderSide(color: Color(0xFFE53E3E)),
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(
              'Cancelar',
              style: GoogleFonts.poppins(color: Colors.grey),
            ),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              _onSearch(_searchQuery);
            },
            child: Text(
              'Pesquisar',
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

  void _openArticle(HelpArticle article) {
    // Implementar abertura do artigo
    Navigator.pushNamed(context, '/support/article', arguments: article);
  }

  void _openFAQ(FAQ faq) {
    // Implementar abertura da FAQ
    Navigator.pushNamed(context, '/support/faq', arguments: faq);
  }
}
