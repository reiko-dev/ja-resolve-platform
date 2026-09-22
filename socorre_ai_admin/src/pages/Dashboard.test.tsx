import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Dashboard from './Dashboard';
import apiService from '../services/api';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: {
    getDashboardStats: jest.fn(),
    getPartners: jest.fn(),
    getEmergencyRequests: jest.fn(),
    getDeliveryOrders: jest.fn(),
    getSubscriptions: jest.fn(),
    getProducts: jest.fn(),
  },
}));

const mockedApi = apiService as unknown as Record<string, jest.Mock>;

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  (global as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverMock;
});

beforeEach(() => {
  mockedApi.getDashboardStats.mockResolvedValue({ success: true, data: {} });
  mockedApi.getPartners.mockResolvedValue({ success: true, data: { partners: [] } });
  mockedApi.getEmergencyRequests.mockResolvedValue({ success: true, data: { requests: [] } });
  mockedApi.getDeliveryOrders.mockResolvedValue({ success: true, data: { orders: [] } });
  mockedApi.getSubscriptions.mockResolvedValue({ success: true, data: { subscriptions: [] } });
  mockedApi.getProducts.mockResolvedValue({ success: true, data: { products: [] } });
});

test('does not render the dead Tow KPI tiles or chart entry', async () => {
  render(<Dashboard />);

  await waitFor(() =>
    expect(screen.getByText('Dashboard Administrativo')).toBeInTheDocument()
  );

  await userEvent.click(screen.getByRole('tab', { name: 'Parceiros' }));
  await waitFor(() => expect(screen.getByText('Parceiros Recentes')).toBeInTheDocument());
  expect(screen.queryByText('Guinchos')).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole('tab', { name: 'Serviços' }));
  await waitFor(() => expect(screen.getByText('Emergências Recentes')).toBeInTheDocument());
  expect(screen.queryByText('Propostas')).not.toBeInTheDocument();
});
