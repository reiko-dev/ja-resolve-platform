import 'dart:convert';
import 'package:flutter/material.dart';

class SupportTicket {
  final String id;
  final String userId;
  final String title;
  final String description;
  final String category;
  final String priority;
  final String status;
  final List<String> attachments;
  final List<SupportMessage> messages;
  final String? assignedTo;
  final DateTime createdAt;
  final DateTime updatedAt;
  final DateTime? resolvedAt;
  final Map<String, dynamic>? metadata;

  SupportTicket({
    required this.id,
    required this.userId,
    required this.title,
    required this.description,
    required this.category,
    required this.priority,
    required this.status,
    this.attachments = const [],
    this.messages = const [],
    this.assignedTo,
    required this.createdAt,
    required this.updatedAt,
    this.resolvedAt,
    this.metadata,
  });

  factory SupportTicket.fromJson(Map<String, dynamic> json) {
    return SupportTicket(
      id: json['id'] ?? '',
      userId: json['user_id'] ?? '',
      title: json['title'] ?? '',
      description: json['description'] ?? '',
      category: json['category'] ?? '',
      priority: json['priority'] ?? 'medium',
      status: json['status'] ?? 'open',
      attachments: json['attachments'] != null 
          ? List<String>.from(json['attachments'])
          : [],
      messages: json['messages'] != null 
          ? (json['messages'] as List).map((m) => SupportMessage.fromJson(m)).toList()
          : [],
      assignedTo: json['assigned_to'],
      createdAt: DateTime.parse(json['created_at'] ?? DateTime.now().toIso8601String()),
      updatedAt: DateTime.parse(json['updated_at'] ?? DateTime.now().toIso8601String()),
      resolvedAt: json['resolved_at'] != null 
          ? DateTime.parse(json['resolved_at'])
          : null,
      metadata: json['metadata'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'user_id': userId,
      'title': title,
      'description': description,
      'category': category,
      'priority': priority,
      'status': status,
      'attachments': attachments,
      'messages': messages.map((m) => m.toJson()).toList(),
      'assigned_to': assignedTo,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
      'resolved_at': resolvedAt?.toIso8601String(),
      'metadata': metadata,
    };
  }

  // Obter cor da prioridade
  Color get priorityColor {
    switch (priority.toLowerCase()) {
      case 'high':
        return Colors.red;
      case 'medium':
        return Colors.orange;
      case 'low':
        return Colors.green;
      default:
        return Colors.grey;
    }
  }

  // Obter cor do status
  Color get statusColor {
    switch (status.toLowerCase()) {
      case 'open':
        return Colors.blue;
      case 'in_progress':
        return Colors.orange;
      case 'resolved':
        return Colors.green;
      case 'closed':
        return Colors.grey;
      default:
        return Colors.grey;
    }
  }

  // Obter texto do status
  String get statusText {
    switch (status.toLowerCase()) {
      case 'open':
        return 'Aberto';
      case 'in_progress':
        return 'Em Andamento';
      case 'resolved':
        return 'Resolvido';
      case 'closed':
        return 'Fechado';
      default:
        return status;
    }
  }

  // Obter texto da prioridade
  String get priorityText {
    switch (priority.toLowerCase()) {
      case 'high':
        return 'Alta';
      case 'medium':
        return 'Média';
      case 'low':
        return 'Baixa';
      default:
        return priority;
    }
  }

  // Verificar se está ativo
  bool get isActive => status == 'open' || status == 'in_progress';

  // Obter tempo desde criação
  String get timeAgo {
    final now = DateTime.now();
    final difference = now.difference(createdAt);
    
    if (difference.inDays > 0) {
      return '${difference.inDays} dia${difference.inDays > 1 ? 's' : ''} atrás';
    } else if (difference.inHours > 0) {
      return '${difference.inHours} hora${difference.inHours > 1 ? 's' : ''} atrás';
    } else if (difference.inMinutes > 0) {
      return '${difference.inMinutes} minuto${difference.inMinutes > 1 ? 's' : ''} atrás';
    } else {
      return 'Agora mesmo';
    }
  }
}

class SupportMessage {
  final String id;
  final String ticketId;
  final String senderId;
  final String senderName;
  final String message;
  final String type;
  final List<String> attachments;
  final DateTime createdAt;
  final bool isRead;
  final Map<String, dynamic>? metadata;

  SupportMessage({
    required this.id,
    required this.ticketId,
    required this.senderId,
    required this.senderName,
    required this.message,
    required this.type,
    this.attachments = const [],
    required this.createdAt,
    this.isRead = false,
    this.metadata,
  });

  factory SupportMessage.fromJson(Map<String, dynamic> json) {
    return SupportMessage(
      id: json['id'] ?? '',
      ticketId: json['ticket_id'] ?? '',
      senderId: json['sender_id'] ?? '',
      senderName: json['sender_name'] ?? '',
      message: json['message'] ?? '',
      type: json['type'] ?? 'text',
      attachments: json['attachments'] != null 
          ? List<String>.from(json['attachments'])
          : [],
      createdAt: DateTime.parse(json['created_at'] ?? DateTime.now().toIso8601String()),
      isRead: json['is_read'] ?? false,
      metadata: json['metadata'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'ticket_id': ticketId,
      'sender_id': senderId,
      'sender_name': senderName,
      'message': message,
      'type': type,
      'attachments': attachments,
      'created_at': createdAt.toIso8601String(),
      'is_read': isRead,
      'metadata': metadata,
    };
  }

  // Verificar se é do usuário
  bool get isFromUser => type == 'user';

  // Verificar se é do suporte
  bool get isFromSupport => type == 'support';

  // Verificar se é sistema
  bool get isSystem => type == 'system';
}

class HelpArticle {
  final String id;
  final String title;
  final String content;
  final String category;
  final List<String> tags;
  final String? author;
  final int views;
  final double rating;
  final bool isPublished;
  final DateTime createdAt;
  final DateTime updatedAt;
  final String? featuredImage;
  final List<String> relatedArticles;
  final Map<String, dynamic>? metadata;

  HelpArticle({
    required this.id,
    required this.title,
    required this.content,
    required this.category,
    this.tags = const [],
    this.author,
    this.views = 0,
    this.rating = 0.0,
    this.isPublished = true,
    required this.createdAt,
    required this.updatedAt,
    this.featuredImage,
    this.relatedArticles = const [],
    this.metadata,
  });

  factory HelpArticle.fromJson(Map<String, dynamic> json) {
    return HelpArticle(
      id: json['id'] ?? '',
      title: json['title'] ?? '',
      content: json['content'] ?? '',
      category: json['category'] ?? '',
      tags: json['tags'] != null 
          ? List<String>.from(json['tags'])
          : [],
      author: json['author'],
      views: json['views'] ?? 0,
      rating: (json['rating'] ?? 0.0).toDouble(),
      isPublished: json['is_published'] ?? true,
      createdAt: DateTime.parse(json['created_at'] ?? DateTime.now().toIso8601String()),
      updatedAt: DateTime.parse(json['updated_at'] ?? DateTime.now().toIso8601String()),
      featuredImage: json['featured_image'],
      relatedArticles: json['related_articles'] != null 
          ? List<String>.from(json['related_articles'])
          : [],
      metadata: json['metadata'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'title': title,
      'content': content,
      'category': category,
      'tags': tags,
      'author': author,
      'views': views,
      'rating': rating,
      'is_published': isPublished,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
      'featured_image': featuredImage,
      'related_articles': relatedArticles,
      'metadata': metadata,
    };
  }

  // Obter resumo do conteúdo
  String get summary {
    if (content.length <= 150) return content;
    return '${content.substring(0, 150)}...';
  }

  // Obter tempo desde criação
  String get timeAgo {
    final now = DateTime.now();
    final difference = now.difference(createdAt);
    
    if (difference.inDays > 0) {
      return '${difference.inDays} dia${difference.inDays > 1 ? 's' : ''} atrás';
    } else if (difference.inHours > 0) {
      return '${difference.inHours} hora${difference.inHours > 1 ? 's' : ''} atrás';
    } else if (difference.inMinutes > 0) {
      return '${difference.inMinutes} minuto${difference.inMinutes > 1 ? 's' : ''} atrás';
    } else {
      return 'Agora mesmo';
    }
  }
}

class HelpCategory {
  final String id;
  final String name;
  final String description;
  final String? icon;
  final int articleCount;
  final List<String> subcategories;
  final bool isActive;
  final DateTime createdAt;
  final DateTime updatedAt;

  HelpCategory({
    required this.id,
    required this.name,
    required this.description,
    this.icon,
    this.articleCount = 0,
    this.subcategories = const [],
    this.isActive = true,
    required this.createdAt,
    required this.updatedAt,
  });

  factory HelpCategory.fromJson(Map<String, dynamic> json) {
    return HelpCategory(
      id: json['id'] ?? '',
      name: json['name'] ?? '',
      description: json['description'] ?? '',
      icon: json['icon'],
      articleCount: json['article_count'] ?? 0,
      subcategories: json['subcategories'] != null 
          ? List<String>.from(json['subcategories'])
          : [],
      isActive: json['is_active'] ?? true,
      createdAt: DateTime.parse(json['created_at'] ?? DateTime.now().toIso8601String()),
      updatedAt: DateTime.parse(json['updated_at'] ?? DateTime.now().toIso8601String()),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'description': description,
      'icon': icon,
      'article_count': articleCount,
      'subcategories': subcategories,
      'is_active': isActive,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
    };
  }
}

class FAQ {
  final String id;
  final String question;
  final String answer;
  final String category;
  final List<String> tags;
  final int views;
  final double rating;
  final bool isPublished;
  final DateTime createdAt;
  final DateTime updatedAt;

  FAQ({
    required this.id,
    required this.question,
    required this.answer,
    required this.category,
    this.tags = const [],
    this.views = 0,
    this.rating = 0.0,
    this.isPublished = true,
    required this.createdAt,
    required this.updatedAt,
  });

  factory FAQ.fromJson(Map<String, dynamic> json) {
    return FAQ(
      id: json['id'] ?? '',
      question: json['question'] ?? '',
      answer: json['answer'] ?? '',
      category: json['category'] ?? '',
      tags: json['tags'] != null 
          ? List<String>.from(json['tags'])
          : [],
      views: json['views'] ?? 0,
      rating: (json['rating'] ?? 0.0).toDouble(),
      isPublished: json['is_published'] ?? true,
      createdAt: DateTime.parse(json['created_at'] ?? DateTime.now().toIso8601String()),
      updatedAt: DateTime.parse(json['updated_at'] ?? DateTime.now().toIso8601String()),
    );
  }

  String get timeAgo {
    final now = DateTime.now();
    final difference = now.difference(createdAt);
    
    if (difference.inDays > 0) {
      return '${difference.inDays}d atrás';
    } else if (difference.inHours > 0) {
      return '${difference.inHours}h atrás';
    } else if (difference.inMinutes > 0) {
      return '${difference.inMinutes}min atrás';
    } else {
      return 'Agora';
    }
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'question': question,
      'answer': answer,
      'category': category,
      'tags': tags,
      'views': views,
      'rating': rating,
      'is_published': isPublished,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
    };
  }
}
