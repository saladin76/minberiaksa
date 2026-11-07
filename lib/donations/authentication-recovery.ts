/** This is a request for stronger verification, never proof of paid money or
 * permission to bypass 3DS. A new 3D session is offered only after inquiry
 * confirms no earlier sale; unknown outcomes remain pending. */
export function bankRequestsAuthentication(code: string, description: string): boolean {
  return code.trim().toUpperCase() === "1A" || /\bAUTHENTICATION_(?:ATTEMPT|REQUIRED)\b/i.test(description);
}
