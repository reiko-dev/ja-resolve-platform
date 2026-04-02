class Document {
  final String id;
  final String type;
  final String title;
  final String filename;
  final String originalName;
  final String filePath;
  final String mimeType;
  final int fileSize;
  final String status; // pending, approved, rejected
  final DateTime uploadDate;
  final DateTime? verifiedDate;
  final String? verifiedBy;
  final String? rejectionReason;
  final Map<String, dynamic>? metadata;

  Document({
    required this.id,
    required this.type,
    required this.title,
    required this.filename,
    required this.originalName,
    required this.filePath,
    required this.mimeType,
    required this.fileSize,
    required this.status,
    required this.uploadDate,
    this.verifiedDate,
    this.verifiedBy,
    this.rejectionReason,
    this.metadata,
  });

  factory Document.fromJson(Map<String, dynamic> json) {
    return Document(
      id: json['id'].toString(),
      type: json['document_type'] ?? json['type'] ?? '',
      title: json['title'] ?? '',
      filename: json['filename'] ?? '',
      originalName: json['original_name'] ?? '',
      filePath: json['file_path'] ?? '',
      mimeType: json['mime_type'] ?? '',
      fileSize: int.parse(json['file_size'].toString()),
      status: json['status'] ?? 'pending',
      uploadDate: DateTime.parse(json['upload_date'] ?? json['created_at']),
      verifiedDate: json['verified_date'] != null 
          ? DateTime.parse(json['verified_date']) 
          : null,
      verifiedBy: json['verified_by'],
      rejectionReason: json['rejection_reason'],
      metadata: json['metadata'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'document_type': type,
      'title': title,
      'filename': filename,
      'original_name': originalName,
      'file_path': filePath,
      'mime_type': mimeType,
      'file_size': fileSize,
      'status': status,
      'upload_date': uploadDate.toIso8601String(),
      'verified_date': verifiedDate?.toIso8601String(),
      'verified_by': verifiedBy,
      'rejection_reason': rejectionReason,
      'metadata': metadata,
    };
  }

  String get formattedFileSize {
    if (fileSize < 1024) {
      return '$fileSize B';
    } else if (fileSize < 1024 * 1024) {
      return '${(fileSize / 1024).toStringAsFixed(1)} KB';
    } else {
      return '${(fileSize / (1024 * 1024)).toStringAsFixed(1)} MB';
    }
  }

  String get statusText {
    switch (status) {
      case 'pending':
        return 'Pendente';
      case 'approved':
        return 'Aprovado';
      case 'rejected':
        return 'Rejeitado';
      default:
        return status;
    }
  }

  bool get isApproved => status == 'approved';
  bool get isPending => status == 'pending';
  bool get isRejected => status == 'rejected';
}
