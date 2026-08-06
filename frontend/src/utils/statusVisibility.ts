import { ApplicationStatus } from '../types';

// Helper function to return visible applicant statuses based on the application's progression
export const getVisibleApplicantStatuses = (currentStatus?: string): ApplicationStatus[] => {
  const normCurrent = currentStatus?.trim() || '';

  // Initial statuses visible for all candidates
  const initialStatuses: ApplicationStatus[] = [
    'New',
    'Submitted',
    'Under Review',
    'Interview Scheduled',
    'Interview Completed',
    'On Hold',
    'Offer Sent',
    'Selected',
    'Rejected'
  ];

  // Final statuses unlocked only after reaching "Offer Sent" or if already in a final state
  const finalStatuses: ApplicationStatus[] = [
    'Offer Accepted',
    'Offer Rejected',
    'Closed',
    'Placed'
  ];

  const hasReachedOfferSent = 
    normCurrent === 'Offer Sent' ||
    normCurrent === 'Offer Accepted' ||
    normCurrent === 'Offer Rejected' ||
    normCurrent === 'Closed' ||
    normCurrent === 'Placed';

  if (hasReachedOfferSent) {
    return [...initialStatuses, ...finalStatuses];
  }

  // If the record currently possesses a final status (safety fallback), include it so it displays correctly
  if (finalStatuses.includes(normCurrent as ApplicationStatus) && !initialStatuses.includes(normCurrent as ApplicationStatus)) {
    return [...initialStatuses, normCurrent as ApplicationStatus];
  }

  return initialStatuses;
};
