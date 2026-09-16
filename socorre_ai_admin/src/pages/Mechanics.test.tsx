import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Mechanics, { normalizeNumber, normalizeSpecialties } from './Mechanics';
import apiService from '../services/api';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: {
    getPartners: jest.fn(),
    createAdminMechanic: jest.fn(),
    updateAdminMechanic: jest.fn(),
  },
}));

jest.mock('@mui/x-data-grid', () => {
  const ReactMock = require('react');
  return {
    DataGrid: ({ rows, columns }: any) =>
      ReactMock.createElement(
        'div',
        { 'data-testid': 'datagrid' },
        rows.map((row: any) =>
          ReactMock.createElement(
            'div',
            { key: row.id, 'data-testid': `row-${row.id}` },
            columns.map((col: any) =>
              ReactMock.createElement(
                'div',
                { key: col.field, 'data-testid': `cell-${row.id}-${col.field}` },
                col.renderCell
                  ? col.renderCell({ value: (row as any)[col.field], row })
                  : String((row as any)[col.field] ?? '')
              )
            )
          )
        )
      ),
  };
});

const mockedApi = apiService as unknown as {
  getPartners: jest.Mock;
  createAdminMechanic: jest.Mock;
  updateAdminMechanic: jest.Mock;
};

function mockMatchMedia() {
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });
  }
}

const baseMechanic = {
  id: 1,
  user_id: 10,
  business_name: 'Oficina Central',
  description: 'Desc',
  specialties: ['Motor'],
  address: 'Rua A',
  latitude: -23.5,
  longitude: -46.6,
  phone: '11999999999',
  email: 'a@a.com',
  hourly_rate: 100,
  rating: 4,
  is_verified: true,
  is_available: true,
  experience_years: 5,
  emergency_service: false,
  home_service: false,
  created_at: '',
  updated_at: '',
};

beforeEach(() => {
  mockMatchMedia();
  jest.clearAllMocks();
  mockedApi.getPartners.mockResolvedValue({
    success: true,
    data: [],
    pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
  });
  mockedApi.createAdminMechanic.mockResolvedValue({ success: true, data: { id: 99 } });
  mockedApi.updateAdminMechanic.mockResolvedValue({ success: true });
});

async function openCreateDialog() {
  render(<Mechanics />);
  expect(await screen.findByTestId('datagrid')).toBeInTheDocument();
  await waitFor(() =>
    expect(mockedApi.getPartners).toHaveBeenCalledWith({ type: 'mechanic', page: 1, limit: 10 })
  );
  const btn = await screen.findByRole('button', { name: /novo mecânico/i });
  fireEvent.click(btn);
  await screen.findByLabelText(/nome do negócio/i);
}

test('permite digitar o nome sem crash', async () => {
  await openCreateDialog();
  const input = screen.getByLabelText(/nome do negócio/i) as HTMLInputElement;
  fireEvent.change(input, { target: { value: 'Oficina do Zé' } });
  expect(input.value).toBe('Oficina do Zé');
});

test('exibe validações PT-BR quando inválido', async () => {
  await openCreateDialog();
  fireEvent.click(screen.getByRole('button', { name: /^criar$/i }));
  expect(await screen.findByText(/mínimo 2 caracteres/i)).toBeInTheDocument();
  expect(screen.getByText(/telefone é obrigatório/i)).toBeInTheDocument();
  expect(screen.getByText(/ao menos uma especialidade/i)).toBeInTheDocument();
  expect(mockedApi.createAdminMechanic).not.toHaveBeenCalled();
});

test('telefone inválido bloqueia submit', async () => {
  await openCreateDialog();
  fireEvent.change(screen.getByLabelText(/nome do negócio/i), { target: { value: 'AB' } });
  const phoneInput = screen.getByLabelText(/^telefone$/i);
  await userEvent.type(phoneInput, '123');
  const specialtiesInput = screen.getByLabelText(/especialidades/i);
  await userEvent.type(specialtiesInput, 'Motor');
  fireEvent.click(screen.getByRole('button', { name: /^criar$/i }));
  expect(await screen.findByText(/telefone inválido/i)).toBeInTheDocument();
  expect(mockedApi.createAdminMechanic).not.toHaveBeenCalled();
});

test('envia payload normalizado e fecha/recarrega em sucesso (sem duplo submit)', async () => {
  await openCreateDialog();
  fireEvent.change(screen.getByLabelText(/nome do negócio/i), { target: { value: 'Oficina do Zé' } });
  fireEvent.change(screen.getByLabelText(/^endereço$/i), { target: { value: 'Rua Central, 100' } });
  const phoneInput = screen.getByLabelText(/^telefone$/i);
  await userEvent.type(phoneInput, '(11) 99999-9999');
  const specialtiesInput = screen.getByLabelText(/especialidades/i);
  await userEvent.type(specialtiesInput, 'Motor, Freios');
  expect((specialtiesInput as HTMLInputElement).value).toBe('Motor, Freios');

  const createBtn = screen.getByRole('button', { name: /^criar$/i });
  fireEvent.click(createBtn);
  fireEvent.click(createBtn);

  await waitFor(() => expect(mockedApi.createAdminMechanic).toHaveBeenCalledTimes(1));
  expect(mockedApi.createAdminMechanic).toHaveBeenCalledWith(
    expect.objectContaining({
      business_name: 'Oficina do Zé',
      phone: '11999999999',
      specialties: ['Motor', 'Freios'],
    })
  );
  await waitFor(() => expect(mockedApi.getPartners).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.queryByLabelText(/nome do negócio/i)).not.toBeInTheDocument());
});

test('mantém diálogo aberto e mostra erro quando API falha', async () => {
  mockedApi.createAdminMechanic.mockRejectedValueOnce({
    response: { data: { message: 'Falha ao criar' } },
  });
  await openCreateDialog();
  fireEvent.change(screen.getByLabelText(/nome do negócio/i), { target: { value: 'Oficina do Zé' } });
  fireEvent.change(screen.getByLabelText(/^endereço$/i), { target: { value: 'Rua Central, 100' } });
  const phoneInput = screen.getByLabelText(/^telefone$/i);
  await userEvent.type(phoneInput, '(11) 99999-9999');
  const specialtiesInput = screen.getByLabelText(/especialidades/i);
  await userEvent.type(specialtiesInput, 'Motor');
  fireEvent.click(screen.getByRole('button', { name: /^criar$/i }));

  expect(await screen.findByText(/falha ao criar/i)).toBeInTheDocument();
  // diálogo continua aberto
  expect(screen.getByLabelText(/nome do negócio/i)).toBeInTheDocument();
});

test('normaliza dados numéricos e specialties da lista sem crash', async () => {
  mockedApi.getPartners.mockResolvedValueOnce({
    success: true,
    data: [
      {
        ...baseMechanic,
        rating: '4.5',
        hourly_rate: '120.5',
        specialties: '["Motor","Freios"]',
      },
    ],
    pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
  });
  render(<Mechanics />);
  // rating normalizado
  expect(await screen.findByText('4.5')).toBeInTheDocument();
  // hourly_rate normalizado
  expect(await screen.findByText(/120\.50/)).toBeInTheDocument();
  expect(screen.getByText('Motor')).toBeInTheDocument();
  expect(screen.getByText('Freios')).toBeInTheDocument();
});

test('edita mecânico pelo endpoint administrativo sem enviar type', async () => {
  mockedApi.getPartners.mockResolvedValueOnce({
    success: true,
    data: [baseMechanic],
    pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
  });

  render(<Mechanics />);
  await screen.findByText('Oficina Central');
  fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
  await screen.findByLabelText(/nome do negócio/i);
  fireEvent.click(screen.getByRole('button', { name: /^salvar$/i }));

  await waitFor(() => expect(mockedApi.updateAdminMechanic).toHaveBeenCalledTimes(1));
  expect(mockedApi.updateAdminMechanic).toHaveBeenCalledWith(
    1,
    expect.not.objectContaining({ type: 'mechanic' }),
  );
});

test('permite limpar descrição na edição', async () => {
  mockedApi.getPartners.mockResolvedValueOnce({
    success: true,
    data: [baseMechanic],
    pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
  });

  render(<Mechanics />);
  await screen.findByText('Oficina Central');
  fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
  const description = await screen.findByLabelText(/descrição/i);
  fireEvent.change(description, { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: /^salvar$/i }));

  await waitFor(() => expect(mockedApi.updateAdminMechanic).toHaveBeenCalledWith(
    1,
    expect.objectContaining({ description: null }),
  ));
});

test('edita mecânico cuja descrição veio nula', async () => {
  mockedApi.getPartners.mockResolvedValueOnce({
    success: true,
    data: [{ ...baseMechanic, description: null }],
    pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
  });

  render(<Mechanics />);
  await screen.findByText('Oficina Central');
  fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
  await screen.findByLabelText(/nome do negócio/i);
  fireEvent.click(screen.getByRole('button', { name: /^salvar$/i }));

  await waitFor(() => expect(mockedApi.updateAdminMechanic).toHaveBeenCalledTimes(1));
});

test('normalizeNumber/normalizeSpecialties tratam strings com segurança', () => {
  expect(normalizeNumber('4.5')).toBe(4.5);
  expect(normalizeNumber('120.50')).toBe(120.5);
  expect(normalizeNumber(undefined)).toBe(0);
  expect(normalizeSpecialties('["A","B"]')).toEqual(['A', 'B']);
  expect(normalizeSpecialties(['A'])).toEqual(['A']);
  expect(normalizeSpecialties('')).toEqual([]);
});
