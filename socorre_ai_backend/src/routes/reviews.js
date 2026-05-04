const express = require('express');
const router = express.Router();
const ReviewController = require('../controllers/reviewController');
const { auth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const reviewSchemas = require('../middleware/validation').reviewSchemas;
const legacyRoute = require('../middleware/legacyRoute');

// Rotas públicas
router.get('/mechanic/:mechanicId', legacyRoute('/api/reviews/partner/:partnerId'), ReviewController.getReviewsByMechanic);
router.get('/partner/:partnerId', ReviewController.getReviewsByPartner);

// Rotas protegidas - usuários autenticados
router.get('/my-reviews', auth, ReviewController.getMyReviews);
router.get('/:id', auth, ReviewController.getReviewById);
router.post('/', auth, validate(reviewSchemas.createReview), ReviewController.createReview);
router.put('/:id', auth, validate(reviewSchemas.updateReview), ReviewController.updateReview);
router.delete('/:id', auth, ReviewController.deleteReview);

// Rotas protegidas - apenas admin
router.get('/', auth, requireRole(['admin']), ReviewController.getAllReviews);
router.patch('/:id/verify', auth, requireRole(['admin']), ReviewController.verifyReview);

module.exports = router;
