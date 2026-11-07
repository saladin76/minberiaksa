/** Email-safe inline table layout. Codes and invitation links are never archived. */
export function donorLoginEmail(code: string, locale: string, loginUrl?: string) {
  if (!/^\d{6}$/.test(code)) throw new Error("INVALID_CODE");
  const ar = locale.toLowerCase().split(/[-_]/)[0] === "ar";
  const copy = ar ? {
    subject: "رمز الدخول إلى حسابك — منبر الأقصى",
    title: "أهلًا بك في منبر الأقصى",
    intro: "استخدم الرمز التالي للدخول إلى حسابك أو تفعيله لأول مرة.",
    label: "رمز تسجيل الدخول",
    expiry: "صالح لمدة 10 دقائق",
    instruction: "أدخل الرمز في صفحة تسجيل الدخول لإكمال دخولك.",
    security: "لا تشارك هذا الرمز مع أي شخص.",
    ignore: "إذا لم تطلب هذا الرمز، يمكنك تجاهل هذه الرسالة.",
    button: "فتح صفحة الدخول وتفعيل الحساب",
    footer: "منبر الأقصى · حساب المتبرع",
  } : {
    subject: "Your Minber Al-Aqsa sign-in code",
    title: "Welcome to Minber Al-Aqsa",
    intro: "Use this code to sign in or activate your donor account for the first time.",
    label: "Your sign-in code",
    expiry: "Valid for 10 minutes",
    instruction: "Enter the code on the sign-in page to continue.",
    security: "Do not share this code with anyone.",
    ignore: "If you did not request this code, you can ignore this email.",
    button: "Open sign in and activate your account",
    footer: "Minber Al-Aqsa · Donor account",
  };
  const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  let invitation = "";
  if (loginUrl) {
    try {
      const target = new URL(loginUrl);
      const configured = new URL(process.env.NEXTAUTH_URL || "https://minberiaksa.org");
      if (target.origin === configured.origin && ["https:", "http:"].includes(target.protocol)) invitation = target.href;
    } catch { /* Never turn an invalid URL into an email action. */ }
  }
  const action = invitation ? `<tr><td align="center" style="padding:6px 28px 24px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" bgcolor="#892e3c" style="border-radius:10px"><a href="${escape(invitation)}" style="display:inline-block;padding:13px 24px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700">${copy.button}</a></td></tr></table></td></tr>` : "";
  const html = `<!doctype html>
<html lang="${ar ? "ar" : "en"}" dir="${ar ? "rtl" : "ltr"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${copy.subject}</title><link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet"></head>
<body style="margin:0;padding:0;background:#f5f3ef;font-family:Cairo,Tahoma,Arial,sans-serif;color:#243f4d;-webkit-text-size-adjust:100%">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;overflow:hidden;opacity:0">${copy.label} · ${copy.expiry}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f5f3ef"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="width:100%;max-width:560px;border:1px solid #e6e1d9;border-radius:18px;overflow:hidden">
<tr><td height="7" bgcolor="#892e3c" style="height:7px;font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td align="center" style="padding:28px 24px 20px;border-bottom:1px solid #f0ece5"><a href="https://minberiaksa.org" style="text-decoration:none"><img src="https://minberiaksa.org/minbar/assets/logo-horizontal.png" width="220" alt="منبر الأقصى — Minber Al-Aqsa" style="display:block;width:220px;max-width:100%;height:auto;border:0"></a></td></tr>
<tr><td align="center" style="padding:28px 28px 8px"><h1 style="margin:0;font-size:22px;line-height:1.6;font-weight:700;color:#243f4d">${copy.title}</h1></td></tr>
<tr><td align="center" style="padding:0 28px 22px;font-size:15px;line-height:1.9;color:#647176">${copy.intro}</td></tr>
<tr><td align="center" style="padding:0 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#faf5e9" style="border:1px solid #e6d4ad;border-radius:12px">
<tr><td align="center" style="padding:16px 12px 4px;font-size:13px;color:#75603a">${copy.label}</td></tr>
<tr><td align="center" dir="ltr" style="padding:4px 8px 10px;font-family:Consolas,'Courier New',monospace;font-size:38px;font-weight:700;line-height:1.5;letter-spacing:7px;white-space:nowrap;color:#892e3c">${code}</td></tr>
<tr><td align="center" style="padding:0 12px 16px;font-size:13px;color:#75603a">${copy.expiry}</td></tr></table></td></tr>
<tr><td align="center" style="padding:20px 28px 12px;font-size:14px;line-height:1.9;color:#647176">${copy.instruction}</td></tr>
${action}
<tr><td align="center" style="padding:6px 28px 22px;font-size:13px;line-height:1.9;color:#892e3c">${copy.security}</td></tr>
<tr><td align="center" style="padding:20px 28px;border-top:1px solid #f0ece5;background:#fcfbf8;font-size:12px;line-height:1.9;color:#7b8588">${copy.ignore}<br>${copy.footer}<br><a href="https://minberiaksa.org" style="color:#892e3c;text-decoration:none">minberiaksa.org</a></td></tr>
</table></td></tr></table></body></html>`;
  const text = [copy.subject, copy.intro, copy.label + ": " + code, copy.expiry, copy.instruction, copy.security, invitation, copy.ignore].filter(Boolean).join("\n\n");
  return { subject: copy.subject, html, text };
}
