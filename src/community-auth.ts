import { CommunityHttpError, DEFAULT_COMMUNITY_CONFIG, isRecord, requestJson, validateConfig } from "./community-client";
import type { AccountRequest, CommunityConfig, CommunityStatus } from "./community-types";

export interface CommunityStorage {
  read(key: string): string | undefined;
  write(key: string, value: string | null): void;
  encrypt(value: string): string | null;
  decrypt(value: string): string;
}
interface Session { email: string; refreshToken: string; accessToken: string; expiresAt: number }

export class CommunityAuth {
  config: CommunityConfig = { ...DEFAULT_COMMUNITY_CONFIG };
  private session: Session | null = null;
  private remembered = false;

  constructor(private storage: CommunityStorage, private fetcher: typeof fetch = fetch) {
    try {
      const config = storage.read("config");
      if (config) this.config = validateConfig(JSON.parse(config));
      const saved = storage.read("session");
      if (saved) {
        const parsed: unknown = JSON.parse(storage.decrypt(saved));
        if (isRecord(parsed) && parsed.endpoint === this.endpoint() && typeof parsed.email === "string" && typeof parsed.refreshToken === "string") {
          this.session = { email: parsed.email, refreshToken: parsed.refreshToken, accessToken: "", expiresAt: 0 };
          this.remembered = true;
        }
      }
    } catch {
      // A moved profile or unavailable OS key must not prevent offline editing.
      this.session = null;
      storage.write("session", null);
    }
  }
  private endpoint(): string { return JSON.stringify([this.config.apiUrl, this.config.region, this.config.clientId]); }
  status(): CommunityStatus {
    return { config: { ...this.config }, signedIn: Boolean(this.session || this.config.devUser), email: this.config.devUser || this.session?.email || "", remembered: this.remembered };
  }
  invalidateSession(): void { this.signOut(); }
  configure(value: unknown): CommunityStatus {
    const config = validateConfig(value);
    this.storage.write("config", JSON.stringify(config));
    this.signOut();
    this.config = config;
    return this.status();
  }
  private signOut(): void {
    this.session = null;
    this.remembered = false;
    this.storage.write("session", null);
  }
  private saveSession(session: Session): void {
    this.session = session;
    let encrypted: string | null = null;
    try { encrypted = this.storage.encrypt(JSON.stringify({ endpoint: this.endpoint(), email: session.email, refreshToken: session.refreshToken })); } catch { /* Use a session in memory when the OS key is unavailable. */ }
    this.storage.write("session", encrypted);
    this.remembered = encrypted !== null;
  }
  private async cognito(action: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    try {
      const result = await requestJson(this.fetcher, `https://cognito-idp.${this.config.region}.amazonaws.com/`, {
        method: "POST",
        headers: { "Content-Type": "application/x-amz-json-1.1", "X-Amz-Target": `AWSCognitoIdentityProviderService.${action}` },
        body: JSON.stringify({ ClientId: this.config.clientId, ...body })
      });
      if (!isRecord(result)) throw new Error("Invalid account response.");
      return result;
    } catch (error) {
      if (error instanceof CommunityHttpError) throw error;
      throw new Error("Unable to reach the account service. Check your connection and try again.");
    }
  }
  private acceptTokens(result: Record<string, unknown>, email: string, refreshToken?: string): void {
    const tokens = result.AuthenticationResult;
    if (!isRecord(tokens) || typeof tokens.AccessToken !== "string" || typeof tokens.ExpiresIn !== "number") {
      throw new Error(result.ChallengeName === "NEW_PASSWORD_REQUIRED" ? "This account requires a password change. Use Reset password, then sign in again." : "This account requires an additional sign-in challenge that this app does not support.");
    }
    const refresh = typeof tokens.RefreshToken === "string" ? tokens.RefreshToken : refreshToken;
    if (!refresh) throw new Error("The account service did not return a refresh token.");
    this.saveSession({ email, refreshToken: refresh, accessToken: tokens.AccessToken, expiresAt: Date.now() + tokens.ExpiresIn * 1000 });
  }
  async accessToken(): Promise<string> {
    const session = this.session;
    if (!session) throw new Error("Sign in to share items or vote.");
    if (session.accessToken && session.expiresAt > Date.now() + 60_000) return session.accessToken;
    try {
      const result = await this.cognito("InitiateAuth", { AuthFlow: "REFRESH_TOKEN_AUTH", AuthParameters: { REFRESH_TOKEN: session.refreshToken } });
      this.acceptTokens(result, session.email, session.refreshToken);
      return this.session!.accessToken;
    } catch (error) {
      if (error instanceof CommunityHttpError && [400, 401, 403].includes(error.status)) {
        this.signOut();
        throw new Error("Your community session expired. Sign in again.");
      }
      throw error;
    }
  }
  async account(request: AccountRequest): Promise<{ message: string; account: CommunityStatus }> {
    if (!isRecord(request)) throw new Error("Invalid account request.");
    if (request.action === "signOut") { this.signOut(); return { message: "Signed out on this device.", account: this.status() }; }
    if (this.config.devUser) throw new Error("Remove the development identity in Connection settings to use an account.");
    // Keep email requests compatible with saved accounts and older clients.
    const email = typeof request.username === "string" ? request.username.trim() : typeof request.email === "string" ? request.email.trim() : "";
    if (!email || email.length > (request.username !== undefined ? 128 : 320)) throw new Error("Enter a valid username.");
    const password = typeof request.password === "string" ? request.password : "";
    const code = typeof request.code === "string" ? request.code.trim() : "";
    if (["signIn", "signUp", "reset"].includes(request.action) && (!password || password.length > 256)) throw new Error("Enter a password of at most 256 characters.");
    if (["confirm", "reset"].includes(request.action) && (!code || code.length > 2048)) throw new Error("Enter the code from your email.");
    let message: string;
    switch (request.action) {
      case "signIn": {
        const result = await this.cognito("InitiateAuth", { AuthFlow: "USER_PASSWORD_AUTH", AuthParameters: { USERNAME: email, PASSWORD: password } });
        this.acceptTokens(result, email);
        message = "Signed in.";
        break;
      }
      case "signUp": {
        const result = await this.cognito("SignUp", { Username: email, Password: password, ...(request.username === undefined ? { UserAttributes: [{ Name: "email", Value: email }] } : {}) });
        message = result.UserConfirmed ? "Account created. You can sign in now." : request.username !== undefined ? "Account created. This service requires account confirmation before you can sign in. Contact the community administrator to confirm your account." : "Account created. Check your email and choose Confirm email to enter the code.";
        break;
      }
      case "confirm":
        await this.cognito("ConfirmSignUp", { Username: email, ConfirmationCode: code });
        message = "Email confirmed. You can sign in now.";
        break;
      case "resend":
        await this.cognito("ResendConfirmationCode", { Username: email });
        message = "A new confirmation code was requested. Check your email.";
        break;
      case "forgot":
        await this.cognito("ForgotPassword", { Username: email });
        message = "A password reset code was requested. Check your email, then choose Reset password.";
        break;
      case "reset":
        await this.cognito("ConfirmForgotPassword", { Username: email, ConfirmationCode: code, Password: password });
        this.signOut();
        message = "Password changed. You can sign in now.";
        break;
      default: throw new Error("Unknown account action.");
    }
    return { message, account: this.status() };
  }
}
