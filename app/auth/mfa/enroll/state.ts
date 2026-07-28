export type EnrollmentState =
  | Readonly<{
      qrCode: string;
      secret: string;
      status: "ready";
    }>
  | Readonly<{
      error: string;
      status: "error";
    }>
  | Readonly<{ status: "loading" }>;

export type EnrollmentVerificationState =
  Readonly<{ error: null }> | Readonly<{ error: string }>;

export const INITIAL_ENROLLMENT_STATE: EnrollmentState = {
  status: "loading",
};

export const INITIAL_VERIFICATION_STATE: EnrollmentVerificationState = {
  error: null,
};
