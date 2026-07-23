export type EnrollmentState =
  | Readonly<{
      qrCode: string;
      status: "ready";
    }>
  | Readonly<{
      error: string;
      status: "error";
    }>
  | null;

export type EnrollmentVerificationState =
  Readonly<{ error: null }> | Readonly<{ error: string }>;

export const INITIAL_ENROLLMENT_STATE: EnrollmentState = null;

export const INITIAL_VERIFICATION_STATE: EnrollmentVerificationState = {
  error: null,
};
