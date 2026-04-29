import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../models/appointment_model.dart';

class AppointmentsScreen extends StatefulWidget {
  const AppointmentsScreen({super.key});

  @override
  _AppointmentsScreenState createState() => _AppointmentsScreenState();
}

class _AppointmentsScreenState extends State<AppointmentsScreen> {
  List<Appointment> _appointments = [];
  bool _isLoading = false;
  
  // all, pending, confirmed, completed, cancelled
  String _selectedFilter = 'all';
  
  DateTime? _selectedDate;

  @override
  void initState() {
    super.initState();
    _loadAppointments();
  }

  Future<void> _loadAppointments() async {
    setState(() => _isLoading = true);

    try {
      final response = await ApiService.getAppointments(
        filter: _selectedFilter,
        date: _selectedDate,
      );

      if (response['success']) {
        setState(() {
          _appointments =
              (response['data'] as List)
                  .map((item) => Appointment.fromJson(item))
                  .toList();
        });
      }
    } catch (e) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Erro ao carregar agendamentos')));
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _cancelAppointment(int appointmentId) async {
    try {
      final response = await ApiService.cancelAppointment(appointmentId);

      if (response['success']) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Agendamento cancelado com sucesso')),
        );
        _loadAppointments();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(response['message'] ?? 'Erro ao cancelar')),
        );
      }
    } catch (e) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Erro ao cancelar agendamento')));
    }
  }

  Future<void> _rescheduleAppointment(int appointmentId) async {
    final DateTime? newDate = await showDatePicker(
      context: context,
      initialDate: DateTime.now(),
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );

    if (newDate != null) {
      try {
        final response = await ApiService.rescheduleAppointment(
          appointmentId,
          newDate,
        );

        if (response['success']) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Agendamento reagendado com sucesso')),
          );
          _loadAppointments();
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(response['message'] ?? 'Erro ao reagendar')),
          );
        }
      } catch (e) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erro ao reagendar agendamento')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Meus Agendamentos'),
        backgroundColor: Colors.blue[600],
        foregroundColor: Colors.white,
        elevation: 0,
      ),
      body: RefreshIndicator(
        onRefresh: _loadAppointments,
        child: Column(
          children: [
            // Filtros
            Container(
              padding: EdgeInsets.all(16),
              color: Colors.white,
              child: Column(
                children: [
                  // Filtro de status
                  Row(
                    children: [
                      Expanded(
                        child: DropdownButtonFormField<String>(
                          initialValue: _selectedFilter,
                          decoration: InputDecoration(
                            labelText: 'Filtrar por status',
                            border: OutlineInputBorder(),
                            prefixIcon: Icon(Icons.filter_list),
                          ),
                          items: [
                            DropdownMenuItem(
                              value: 'all',
                              child: Text('Todos'),
                            ),
                            DropdownMenuItem(
                              value: 'pending',
                              child: Text('Pendentes'),
                            ),
                            DropdownMenuItem(
                              value: 'confirmed',
                              child: Text('Confirmados'),
                            ),
                            DropdownMenuItem(
                              value: 'completed',
                              child: Text('Concluídos'),
                            ),
                            DropdownMenuItem(
                              value: 'cancelled',
                              child: Text('Cancelados'),
                            ),
                          ],
                          onChanged: (value) {
                            setState(() => _selectedFilter = value!);
                            _loadAppointments();
                          },
                        ),
                      ),
                      SizedBox(width: 16),
                      // Filtro de data
                      Expanded(
                        child: InkWell(
                          onTap: () async {
                            final DateTime? date = await showDatePicker(
                              context: context,
                              initialDate: DateTime.now(),
                              firstDate: DateTime.now(),
                              lastDate: DateTime.now().add(
                                const Duration(days: 365),
                              ),
                            );
                            if (date != null) {
                              setState(() => _selectedDate = date);
                              _loadAppointments();
                            }
                          },
                          child: InputDecorator(
                            decoration: InputDecoration(
                              labelText: 'Data',
                              border: OutlineInputBorder(),
                              prefixIcon: Icon(Icons.calendar_today),
                              suffixIcon: Icon(Icons.arrow_drop_down),
                            ),
                            child: Text(
                              _selectedDate != null
                                  ? '${_selectedDate!.day}/${_selectedDate!.month}/${_selectedDate!.year}'
                                  : 'Todas as datas',
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),

            // Lista de agendamentos
            Expanded(
              child:
                  _isLoading
                      ? Center(child: CircularProgressIndicator())
                      : _appointments.isEmpty
                      ? _buildEmptyState()
                      : ListView.builder(
                        padding: EdgeInsets.all(8),
                        itemCount: _appointments.length,
                        itemBuilder: (context, index) {
                          final appointment = _appointments[index];
                          return _buildAppointmentCard(appointment);
                        },
                      ),
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () async {
          // Navegar para tela de novo agendamento
          Navigator.of(context).pushNamed('/new-appointment');
        },
        backgroundColor: Colors.blue[600],
        child: Icon(Icons.add),
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.calendar_today, size: 80, color: Colors.grey[400]),
          SizedBox(height: 16),
          Text(
            'Nenhum agendamento encontrado',
            style: TextStyle(
              fontSize: 18,
              color: Colors.grey[600],
              fontWeight: FontWeight.w500,
            ),
          ),
          SizedBox(height: 8),
          Text(
            'Toque no + para agendar um serviço',
            style: TextStyle(fontSize: 14, color: Colors.grey[500]),
          ),
        ],
      ),
    );
  }

  Widget _buildAppointmentCard(Appointment appointment) {
    return Card(
      margin: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      elevation: 4,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header com status e data
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        appointment.serviceType,
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                          color: Colors.blue[700],
                        ),
                      ),
                      SizedBox(height: 4),
                      Text(
                        appointment.partnerName,
                        style: TextStyle(fontSize: 14, color: Colors.grey[700]),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: _getStatusColor(appointment.status),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    _getStatusText(appointment.status),
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),

            Divider(height: 16),

            // Data e hora
            Row(
              children: [
                Icon(Icons.calendar_today, size: 16, color: Colors.grey[600]),
                SizedBox(width: 8),
                Text(
                  '${appointment.scheduledDate.day}/${appointment.scheduledDate.month}/${appointment.scheduledDate.year} às ${appointment.scheduledTime}',
                  style: TextStyle(color: Colors.grey[700]),
                ),
              ],
            ),

            SizedBox(height: 8),

            // Descrição
            if (appointment.description.isNotEmpty)
              Text(
                appointment.description,
                style: TextStyle(fontSize: 14, color: Colors.grey[800]),
              ),

            SizedBox(height: 12),

            // Endereço
            Row(
              children: [
                Icon(Icons.location_on, size: 16, color: Colors.grey[600]),
                SizedBox(width: 8),
                Expanded(
                  child: Text(
                    appointment.address,
                    style: TextStyle(color: Colors.grey[700]),
                  ),
                ),
              ],
            ),

            SizedBox(height: 16),

            // Ações
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => _rescheduleAppointment(appointment.id),
                    child: Text('Reagendar'),
                  ),
                ),
                SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton(
                    onPressed:
                        appointment.status == 'pending'
                            ? () => _cancelAppointment(appointment.id)
                            : null,
                    style: ElevatedButton.styleFrom(
                      backgroundColor:
                          appointment.status == 'pending'
                              ? Colors.red[600]
                              : Colors.grey[300],
                    ),
                    child: Text(
                      appointment.status == 'pending'
                          ? 'Cancelar'
                          : 'Ver Detalhes',
                      style: TextStyle(
                        color:
                            appointment.status == 'pending'
                                ? Colors.white
                                : Colors.grey[600],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'pending':
        return Colors.orange[600] ?? Colors.orange;
      case 'confirmed':
        return Colors.blue[600] ?? Colors.blue;
      case 'completed':
        return Colors.green[600] ?? Colors.green;
      case 'cancelled':
        return Colors.red[600] ?? Colors.red;
      default:
        return Colors.grey[600] ?? Colors.grey;
    }
  }

  String _getStatusText(String status) {
    switch (status) {
      case 'pending':
        return 'Pendente';
      case 'confirmed':
        return 'Confirmado';
      case 'completed':
        return 'Concluído';
      case 'cancelled':
        return 'Cancelado';
      default:
        return status;
    }
  }
}
