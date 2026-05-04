const ONBOARDING_STAGES = {
  ACCOUNT_CREATED: 'account_created',
  DOCUMENTS_PENDING: 'documents_pending',
  UNDER_REVIEW: 'under_review',
  APPROVED: 'approved',
};

function nextStepFromStage(stage, partnerType = '') {
  switch (stage) {
    case ONBOARDING_STAGES.ACCOUNT_CREATED:
      return partnerType ? 'complete_registration' : 'partner_type_selection';
    case ONBOARDING_STAGES.DOCUMENTS_PENDING:
      return partnerType ? 'document_upload' : 'partner_type_selection';
    case ONBOARDING_STAGES.UNDER_REVIEW:
      return 'pending_review';
    case ONBOARDING_STAGES.APPROVED:
      return 'dashboard';
    default:
      return partnerType ? 'complete_registration' : 'partner_type_selection';
  }
}

module.exports = {
  ONBOARDING_STAGES,
  nextStepFromStage,
};
