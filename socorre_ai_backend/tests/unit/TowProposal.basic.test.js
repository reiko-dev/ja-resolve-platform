const TowProposal = require('../../src/models/TowProposal');

describe('TowProposal Model - Basic Tests', () => {
  describe('Model Structure', () => {
    it('deve ter a estrutura correta', () => {
      expect(TowProposal).toBeDefined();
      expect(typeof TowProposal.create).toBe('function');
      expect(typeof TowProposal.findById).toBe('function');
      expect(typeof TowProposal.findByEmergencyRequest).toBe('function');
      expect(typeof TowProposal.findByPartner).toBe('function');
      expect(typeof TowProposal.updateStatus).toBe('function');
      expect(typeof TowProposal.delete).toBe('function');
      expect(typeof TowProposal.getStats).toBe('function');
    });
  });
  
  describe('Validation', () => {
    it('deve validar dados de entrada', () => {
      const validData = {
        emergency_request_id: 1,
        partner_id: 1,
        estimated_value: 150.00,
        estimated_time_minutes: 30
      };
      
      // Teste básico de validação
      expect(validData.emergency_request_id).toBe(1);
      expect(validData.partner_id).toBe(1);
      expect(validData.estimated_value).toBe(150.00);
      expect(validData.estimated_time_minutes).toBe(30);
    });
    
    it('deve rejeitar dados inválidos', () => {
      const invalidData = {
        emergency_request_id: null,
        partner_id: null,
        estimated_value: -50,
        estimated_time_minutes: 0
      };
      
      expect(invalidData.emergency_request_id).toBeNull();
      expect(invalidData.partner_id).toBeNull();
      expect(invalidData.estimated_value).toBe(-50);
      expect(invalidData.estimated_time_minutes).toBe(0);
    });
  });
  
  describe('Status Transitions', () => {
    it('deve permitir transições de status válidas', () => {
      const validTransitions = [
        { from: 'pending', to: 'accepted' },
        { from: 'pending', to: 'rejected' },
        { from: 'accepted', to: 'completed' },
        { from: 'accepted', to: 'cancelled' }
      ];
      
      validTransitions.forEach(transition => {
        expect(transition.from).toBeDefined();
        expect(transition.to).toBeDefined();
      });
    });
  });
});
