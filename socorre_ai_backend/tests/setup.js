const { Pool } = require('pg');
const knex = require('knex');

// Configuração do banco de dados para testes
const testDbConfig = {
  client: 'sqlite3',
  connection: ':memory:',
  useNullAsDefault: true,
  migrations: {
    directory: './src/database/migrations'
  },
  seeds: {
    directory: './src/database/seeders'
  }
};

// Pool PostgreSQL para testes de integração
const testPool = new Pool({
  host: process.env.TEST_DB_HOST || 'localhost',
  port: process.env.TEST_DB_PORT || 5432,
  database: process.env.TEST_DB_NAME || 'socorre_ai_test',
  user: process.env.TEST_DB_USER || 'postgres',
  password: process.env.TEST_DB_PASSWORD || 'postgres',
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Configuração global do Jest
beforeAll(async () => {
  // Configurar variáveis de ambiente para testes
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-jwt-secret-key';
  process.env.FIREBASE_PROJECT_ID = 'test-project';
  process.env.REDIS_URL = 'redis://localhost:6379/1'; // DB separado para testes
  
  // Inicializar banco de dados de teste
  const testDb = knex(testDbConfig);
  
  try {
    // Rodar migrations no banco de teste
    await testDb.migrate.latest();
    
    // Opcional: Rodar seeds para dados de teste
    // await testDb.seed.run();
    
    console.log('✅ Banco de dados de teste configurado');
  } catch (error) {
    console.error('❌ Erro ao configurar banco de dados de teste:', error);
  }
  
  await testDb.destroy();
});

afterAll(async () => {
  // Limpar conexões do banco de dados
  await testPool.end();
});

// Limpar banco de dados entre testes
beforeEach(async () => {
  const testDb = knex(testDbConfig);
  
  // Limpar tabelas principais
  const tables = [
    'tow_proposals',
    'subscriptions',
    'delivery_orders',
    'products',
    'system_settings',
    'emergency_requests',
    'partners',
    'users',
    'payments',
    'reviews',
    'appointments',
    'purchase_orders',
    'categories',
    'services'
  ];
  
  for (const table of tables) {
    try {
      await testDb(table).del();
    } catch (error) {
      // Tabela pode não existir, ignorar
    }
  }
  
  await testDb.destroy();
});

// Mock para Firebase Admin
jest.mock('firebase-admin', () => ({
  credential: {
    cert: jest.fn()
  },
  initializeApp: jest.fn(() => ({
    auth: () => ({
      verifyIdToken: jest.fn(),
      createUser: jest.fn(),
      updateUser: jest.fn(),
      deleteUser: jest.fn()
    }),
    messaging: () => ({
      send: jest.fn(),
      sendMulticast: jest.fn()
    }),
    firestore: () => ({
      collection: jest.fn(() => ({
        doc: jest.fn(() => ({
          get: jest.fn(),
          set: jest.fn(),
          update: jest.fn(),
          delete: jest.fn()
        })),
        add: jest.fn(),
        where: jest.fn(),
        orderBy: jest.fn(),
        limit: jest.fn(),
        get: jest.fn()
      }))
    })
  }))
}));

// Mock para Redis
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    connect: jest.fn(),
    disconnect: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    expire: jest.fn(),
    flushAll: jest.fn()
  }))
}));

// Mock para Socket.IO
jest.mock('socket.io', () => ({
  Server: jest.fn(() => ({
    use: jest.fn(),
    on: jest.fn(),
    emit: jest.fn(),
    to: jest.fn(() => ({
      emit: jest.fn()
    }))
  }))
}));

// Funções utilitárias para testes
global.testUtils = {
  // Criar usuário de teste
  createTestUser: async (overrides = {}) => {
    const testDb = knex(testDbConfig);
    const [user] = await testDb('users').insert({
      name: 'Test User',
      email: 'test@example.com',
      phone: '5511999999999',
      password_hash: '$2b$10$testhash',
      is_active: true,
      is_verified: true,
      created_at: new Date(),
      updated_at: new Date(),
      ...overrides
    }).returning('*');
    
    await testDb.destroy();
    return user;
  },
  
  // Criar parceiro de teste
  createTestPartner: async (overrides = {}) => {
    const testDb = knex(testDbConfig);
    const [partner] = await testDb('partners').insert({
      user_id: 1,
      business_name: 'Test Partner',
      type: 'mechanic',
      document: '12345678901',
      phone: '5511999999999',
      email: 'partner@test.com',
      is_verified: true,
      is_online: true,
      rating: 4.5,
      latitude: -23.5505,
      longitude: -46.6333,
      created_at: new Date(),
      updated_at: new Date(),
      ...overrides
    }).returning('*');
    
    await testDb.destroy();
    return partner;
  },
  
  // Gerar token JWT para testes
  generateTestToken: (userId = 1, role = 'user') => {
    const jwt = require('jsonwebtoken');
    return jwt.sign(
      { 
        id: userId, 
        email: 'test@example.com',
        role: role 
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  },
  
  // Criar requisição de emergência de teste
  createTestEmergencyRequest: async (overrides = {}) => {
    const testDb = knex(testDbConfig);
    const [request] = await testDb('emergency_requests').insert({
      user_id: 1,
      type: 'battery',
      description: 'Test emergency request',
      urgency: 'medium',
      status: 'pending',
      latitude: -23.5505,
      longitude: -46.6333,
      address: 'Test Address',
      created_at: new Date(),
      updated_at: new Date(),
      ...overrides
    }).returning('*');
    
    await testDb.destroy();
    return request;
  }
};

// Silenciar logs durante os testes
if (process.env.NODE_ENV === 'test') {
  console.log = jest.fn();
  console.info = jest.fn();
  console.warn = jest.fn();
  console.error = jest.fn();
}
