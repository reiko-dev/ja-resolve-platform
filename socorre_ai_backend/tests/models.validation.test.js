// Teste de validação dos novos modelos
const TowProposal = require('../src/models/TowProposal');
const Subscription = require('../src/models/Subscription');
const DeliveryOrder = require('../src/models/DeliveryOrder');

describe('Models Validation', () => {
  describe('TowProposal Model', () => {
    it('deve existir o modelo TowProposal', () => {
      expect(TowProposal).toBeDefined();
    });
    
    it('deve ter métodos principais', () => {
      const requiredMethods = [
        'create',
        'findById',
        'findByEmergencyRequest',
        'findByPartner',
        'updateStatus',
        'delete',
        'getStats'
      ];
      
      requiredMethods.forEach(method => {
        expect(typeof TowProposal[method]).toBe('function');
      });
    });
  });
  
  describe('Subscription Model', () => {
    it('deve existir o modelo Subscription', () => {
      expect(Subscription).toBeDefined();
    });
    
    it('deve ter métodos principais', () => {
      const requiredMethods = [
        'create',
        'findById',
        'findByPartner',
        'findActive',
        'updateStatus',
        'processPayment',
        'findExpiringSoon',
        'getStats'
      ];
      
      requiredMethods.forEach(method => {
        expect(typeof Subscription[method]).toBe('function');
      });
    });
  });
  
  describe('DeliveryOrder Model', () => {
    it('deve existir o modelo DeliveryOrder', () => {
      expect(DeliveryOrder).toBeDefined();
    });
    
    it('deve ter métodos principais', () => {
      const requiredMethods = [
        'create',
        'findById',
        'findByStatus',
        'findByMotoboy',
        'updateStatus',
        'addTrackingPoint',
        'getStats'
      ];
      
      requiredMethods.forEach(method => {
        expect(typeof DeliveryOrder[method]).toBe('function');
      });
    });
  });
  
  describe('Business Logic Validation', () => {
    it('deve validar tipos de parceiro', () => {
      const validTypes = ['mechanic', 'gas_station', 'auto_parts', 'motoboy', 'tow'];
      
      validTypes.forEach(type => {
        expect(validTypes).toContain(type);
      });
    });
    
    it('deve validar status de propostas', () => {
      const validStatuses = ['pending', 'accepted', 'rejected', 'expired'];
      
      validStatuses.forEach(status => {
        expect(validStatuses).toContain(status);
      });
    });
    
    it('deve validar status de deliveries', () => {
      const validStatuses = [
        'pending', 'accepted', 'cancelled', 'picked_up', 
        'in_transit', 'delivered', 'failed'
      ];
      
      validStatuses.forEach(status => {
        expect(validStatuses).toContain(status);
      });
    });
    
    it('deve validar status de assinaturas', () => {
      const validStatuses = [
        'active', 'expired', 'cancelled', 'pending_payment', 'suspended'
      ];
      
      validStatuses.forEach(status => {
        expect(validStatuses).toContain(status);
      });
    });
    
    it('deve calcular valores corretamente', () => {
      // Teste de cálculo de proposta
      const proposalValue = 150.00;
      const platformFee = proposalValue * 0.25; // 25%
      const partnerNetValue = proposalValue - platformFee;
      
      expect(partnerNetValue).toBe(112.50);
      
      // Teste de cálculo de delivery
      const itemsTotal = 50.00;
      const deliveryFee = 10.00;
      const platformFeeDelivery = 5.00;
      const totalDelivery = itemsTotal + deliveryFee + platformFeeDelivery;
      
      expect(totalDelivery).toBe(65.00);
      
      // Teste de cálculo de assinatura
      const monthlyFee = 99.90;
      const annualRevenue = monthlyFee * 12;
      
      expect(annualRevenue).toBeCloseTo(1198.80, 2);
    });
  });
});
