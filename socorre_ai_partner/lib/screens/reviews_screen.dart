import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../models/review.dart';
import '../services/review_service.dart';
import '../widgets/review_card.dart';
import '../widgets/review_stats.dart';

class ReviewsScreen extends StatefulWidget {
  final String partnerId;
  
  const ReviewsScreen({
    super.key,
    required this.partnerId,
  });

  @override
  State<ReviewsScreen> createState() => _ReviewsScreenState();
}

class _ReviewsScreenState extends State<ReviewsScreen> {
  List<Review> _reviews = [];
  ReviewStats? _stats;
  bool _isLoading = true;
  bool _isLoadingMore = false;
  int _currentPage = 1;
  int _totalPages = 1;
  String _sortBy = 'newest';
  String _filter = 'all';
  String _error = '';

  @override
  void initState() {
    super.initState();
    _loadReviews();
    _loadStats();
  }

  Future<void> _loadReviews() async {
    setState(() {
      _isLoading = true;
      _error = '';
    });

    try {
      final result = await ReviewService.getPartnerReviews(
        partnerId: widget.partnerId,
        page: _currentPage,
        limit: 10,
        sortBy: _sortBy,
        filter: _filter,
      );

      if (result['success']) {
        setState(() {
          _reviews = (result['data'] as List)
              .map((review) => Review.fromJson(review))
              .toList();
          _totalPages = result['pagination']['totalPages'] ?? 1;
        });
      } else {
        setState(() {
          _error = result['message'];
        });
      }
    } catch (e) {
      setState(() {
        _error = 'Erro ao carregar avaliações: $e';
      });
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  Future<void> _loadStats() async {
    try {
      final result = await ReviewService.getReviewStats(
        partnerId: widget.partnerId,
      );

      if (result['success']) {
        setState(() {
          _stats = result['data'];
        });
      }
    } catch (e) {
      print('Erro ao carregar estatísticas: $e');
    }
  }

  Future<void> _loadMoreReviews() async {
    if (_currentPage >= _totalPages || _isLoadingMore) return;

    setState(() {
      _isLoadingMore = true;
    });

    try {
      final result = await ReviewService.getPartnerReviews(
        partnerId: widget.partnerId,
        page: _currentPage + 1,
        limit: 10,
        sortBy: _sortBy,
        filter: _filter,
      );

      if (result['success']) {
        setState(() {
          _reviews.addAll((result['data'] as List)
              .map((review) => Review.fromJson(review))
              .toList());
          _currentPage++;
        });
      }
    } catch (e) {
      print('Erro ao carregar mais avaliações: $e');
    } finally {
      setState(() {
        _isLoadingMore = false;
      });
    }
  }

  void _onSortChanged(String sortBy) {
    setState(() {
      _sortBy = sortBy;
      _currentPage = 1;
    });
    _loadReviews();
  }

  void _onFilterChanged(String filter) {
    setState(() {
      _filter = filter;
      _currentPage = 1;
    });
    _loadReviews();
  }

  Future<void> _onRefresh() async {
    _currentPage = 1;
    _loadReviews();
    _loadStats();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF1A1A1A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1A1A1A),
        foregroundColor: Colors.white,
        title: Text(
          'Avaliações',
          style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
        ),
        centerTitle: true,
        actions: [
          IconButton(
            icon: const Icon(Icons.filter_list),
            onPressed: _showFilterDialog,
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
              : RefreshIndicator(
                  onRefresh: _onRefresh,
                  color: const Color(0xFFE53E3E),
                  child: CustomScrollView(
                    slivers: [
                      // Estatísticas
                      if (_stats != null)
                        SliverToBoxAdapter(
                          child: ReviewStatsWidget(stats: _stats!),
                        ),
                      
                      // Filtros
                      SliverToBoxAdapter(
                        child: _buildFilters(),
                      ),
                      
                      // Lista de avaliações
                      SliverList(
                        delegate: SliverChildBuilderDelegate(
                          (context, index) {
                            if (index < _reviews.length) {
                              return ReviewCard(
                                review: _reviews[index],
                                onRespond: (review) => _showRespondDialog(review),
                                onReport: (review) => _showReportDialog(review),
                              );
                            } else if (_isLoadingMore) {
                              return const Center(
                                child: Padding(
                                  padding: EdgeInsets.all(16),
                                  child: CircularProgressIndicator(),
                                ),
                              );
                            } else if (_currentPage < _totalPages) {
                              return Center(
                                child: Padding(
                                  padding: const EdgeInsets.all(16),
                                  child: ElevatedButton(
                                    onPressed: _loadMoreReviews,
                                    child: const Text('Carregar mais'),
                                  ),
                                ),
                              );
                            }
                            return null;
                          },
                          childCount: _reviews.length + (_isLoadingMore ? 1 : 0) + (_currentPage < _totalPages ? 1 : 0),
                        ),
                      ),
                    ],
                  ),
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
            'Erro ao carregar avaliações',
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

  Widget _buildFilters() {
    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF2A2A2A),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Filtros',
            style: GoogleFonts.poppins(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<String>(
                  value: _sortBy,
                  decoration: InputDecoration(
                    labelText: 'Ordenar por',
                    labelStyle: GoogleFonts.poppins(color: Colors.white70),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
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
                  dropdownColor: const Color(0xFF2A2A2A),
                  items: const [
                    DropdownMenuItem(value: 'newest', child: Text('Mais recentes')),
                    DropdownMenuItem(value: 'oldest', child: Text('Mais antigas')),
                    DropdownMenuItem(value: 'highest', child: Text('Maior avaliação')),
                    DropdownMenuItem(value: 'lowest', child: Text('Menor avaliação')),
                  ],
                  onChanged: (value) {
                    if (value != null) {
                      _onSortChanged(value);
                    }
                  },
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: DropdownButtonFormField<String>(
                  value: _filter,
                  decoration: InputDecoration(
                    labelText: 'Filtrar por',
                    labelStyle: GoogleFonts.poppins(color: Colors.white70),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
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
                  dropdownColor: const Color(0xFF2A2A2A),
                  items: const [
                    DropdownMenuItem(value: 'all', child: Text('Todas')),
                    DropdownMenuItem(value: '5', child: Text('5 estrelas')),
                    DropdownMenuItem(value: '4', child: Text('4 estrelas')),
                    DropdownMenuItem(value: '3', child: Text('3 estrelas')),
                    DropdownMenuItem(value: '2', child: Text('2 estrelas')),
                    DropdownMenuItem(value: '1', child: Text('1 estrela')),
                  ],
                  onChanged: (value) {
                    if (value != null) {
                      _onFilterChanged(value);
                    }
                  },
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  void _showFilterDialog() {
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
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Implementar filtros avançados aqui
            Text(
              'Filtros avançados em desenvolvimento',
              style: GoogleFonts.poppins(color: Colors.white70),
            ),
          ],
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

  void _showRespondDialog(Review review) {
    final controller = TextEditingController();
    
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF2A2A2A),
        title: Text(
          'Responder Avaliação',
          style: GoogleFonts.poppins(
            color: Colors.white,
            fontWeight: FontWeight.bold,
          ),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'Responda à avaliação de ${review.clientName}',
              style: GoogleFonts.poppins(color: Colors.white70),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: controller,
              maxLines: 3,
              style: GoogleFonts.poppins(color: Colors.white),
              decoration: InputDecoration(
                labelText: 'Sua resposta',
                labelStyle: GoogleFonts.poppins(color: Colors.white70),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
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
          ],
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
              // Implementar resposta
              Navigator.pop(context);
            },
            child: Text(
              'Responder',
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

  void _showReportDialog(Review review) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF2A2A2A),
        title: Text(
          'Reportar Avaliação',
          style: GoogleFonts.poppins(
            color: Colors.white,
            fontWeight: FontWeight.bold,
          ),
        ),
        content: Text(
          'Tem certeza que deseja reportar esta avaliação?',
          style: GoogleFonts.poppins(color: Colors.white70),
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
              // Implementar reporte
              Navigator.pop(context);
            },
            child: Text(
              'Reportar',
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
}
