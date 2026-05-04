const fs = require('fs');
const knex = require('../config/database');

class UserDocument {
  static async create(documentData) {
    const [inserted] = await knex('user_documents')
      .insert({
        ...documentData,
        uploaded_at: knex.fn.now(),
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      })
      .returning('*');

    return inserted;
  }

  static async findByUserId(userId) {
    return knex('user_documents')
      .where('user_id', userId)
      .orderBy('uploaded_at', 'desc');
  }

  static async findByType(userId, documentType) {
    return knex('user_documents')
      .where('user_id', userId)
      .where('document_type', documentType)
      .first();
  }

  static async findById(id) {
    return knex('user_documents')
      .where('id', id)
      .first();
  }

  static async delete(id) {
    const document = await this.findById(id);
    if (!document) {
      return false;
    }

    if (document.file_path && fs.existsSync(document.file_path)) {
      fs.unlinkSync(document.file_path);
    }

    await knex('user_documents').where('id', id).del();
    return true;
  }
}

module.exports = UserDocument;
