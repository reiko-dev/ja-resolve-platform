// Teste simples para verificar configuração do Jest
describe('Jest Configuration Test', () => {
  it('deve executar teste básico', () => {
    expect(true).toBe(true);
    expect(1 + 1).toBe(2);
    expect('Socorre AI').toContain('Socorre');
  });
  
  it('deve validar ambiente de teste', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });
  
  it('deve ter funções utilitárias globais', () => {
    expect(global.testUtils).toBeDefined();
    expect(typeof global.testUtils.generateTestToken).toBe('function');
    expect(typeof global.testUtils.createTestUser).toBe('function');
  });
});
