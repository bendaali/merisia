let sharedNotifier = null;

export function setRealtimeNotifier(notifier) {
  sharedNotifier = notifier;
}

export function notifyDesignDeleted(designUuid) {
  sharedNotifier?.deleted(designUuid);
}

export function notifyCollaboratorRoleUpdated(designUuid, userEmail, role) {
  sharedNotifier?.roleUpdated(designUuid, userEmail, role);
}

export function notifyCollaboratorAccessRevoked(designUuid, userEmail) {
  sharedNotifier?.accessRevoked(designUuid, userEmail);
}
