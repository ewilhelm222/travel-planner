// An expired login is different from explicit sign-out or revoked access.
// Preserve the previously downloaded reading copy while pausing all writes.
export function responsePolicy(status, contentType = "") {
  if (status === 403) return { clearCopy: true, needsSignIn: false, message: "Access was denied. The downloaded copy has been cleared on this device." };
  if (status === 401 || (status === 200 && !contentType.includes("application/json"))) {
    return { clearCopy: false, needsSignIn: true, message: "Sign-in needs refreshing. Your downloaded itinerary is still available to read; sign in again to update it." };
  }
  return null;
}
