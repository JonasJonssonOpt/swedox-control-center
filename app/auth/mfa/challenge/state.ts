export type ChallengeVerificationState = Readonly<{
  error: string | null;
}>;

export const INITIAL_CHALLENGE_STATE: ChallengeVerificationState = {
  error: null,
};
