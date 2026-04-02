const express = require('express');
const router = express.Router();
const AppointmentController = require('../controllers/appointmentController');
const { auth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const appointmentSchemas = require('../middleware/validation').appointmentSchemas;

// Rotas protegidas - usuários autenticados
router.get('/my-appointments', auth, AppointmentController.getMyAppointments);
router.get('/mechanic-appointments', auth, requireRole(['mechanic', 'admin']), AppointmentController.getMechanicAppointments);
router.get('/date/:date', auth, AppointmentController.getAppointmentsByDate);
router.get('/:id', auth, AppointmentController.getAppointmentById);
router.post('/', auth, validate(appointmentSchemas.createAppointment), AppointmentController.createAppointment);
router.put('/:id', auth, validate(appointmentSchemas.updateAppointment), AppointmentController.updateAppointment);
router.patch('/:id/status', auth, validate(appointmentSchemas.updateStatus), AppointmentController.updateAppointmentStatus);
router.delete('/:id', auth, AppointmentController.deleteAppointment);

// Rotas protegidas - apenas admin
router.get('/', auth, requireRole(['admin']), AppointmentController.getAllAppointments);
router.get('/stats', auth, requireRole(['admin']), AppointmentController.getAppointmentStats);

module.exports = router;
