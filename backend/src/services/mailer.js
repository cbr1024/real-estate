const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn('SMTP not configured. Email sending disabled.');
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: false,
    auth: { user, pass },
  });

  return transporter;
}

async function sendVerificationEmail(to, token) {
  const t = getTransporter();
  const appUrl = process.env.APP_URL || 'http://localhost';
  const verifyUrl = `${appUrl}/verify-email?token=${token}`;

  if (!t) {
    console.log(`[DEV] Verification URL for ${to}: ${verifyUrl}`);
    return;
  }

  await t.sendMail({
    from: `"아파트 시세" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to,
    subject: '[아파트 시세] 이메일 인증을 완료해주세요',
    html: `
      <div style="max-width:480px;margin:0 auto;font-family:-apple-system,'Noto Sans KR',sans-serif;">
        <div style="padding:32px 24px;background:#2563eb;border-radius:12px 12px 0 0;text-align:center;">
          <h1 style="color:white;margin:0;font-size:22px;">이메일 인증</h1>
        </div>
        <div style="padding:32px 24px;background:white;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
          <p style="color:#333;font-size:15px;line-height:1.6;">
            안녕하세요! 아파트 시세 서비스에 가입해주셔서 감사합니다.
          </p>
          <p style="color:#333;font-size:15px;line-height:1.6;">
            아래 버튼을 클릭하여 이메일 인증을 완료해주세요.
          </p>
          <div style="text-align:center;margin:28px 0;">
            <a href="${verifyUrl}" style="
              display:inline-block;padding:14px 40px;
              background:#2563eb;color:white;text-decoration:none;
              border-radius:8px;font-size:15px;font-weight:600;
            ">이메일 인증하기</a>
          </div>
          <p style="color:#999;font-size:12px;line-height:1.5;">
            버튼이 작동하지 않으면 아래 링크를 브라우저에 직접 붙여넣기 해주세요.<br>
            <a href="${verifyUrl}" style="color:#2563eb;word-break:break-all;">${verifyUrl}</a>
          </p>
          <p style="color:#999;font-size:12px;">이 링크는 24시간 동안 유효합니다.</p>
        </div>
      </div>
    `,
  });
}

async function sendPasswordResetEmail(to, token) {
  const t = getTransporter();
  const appUrl = process.env.APP_URL || 'http://localhost';
  const resetUrl = `${appUrl}/reset-password?token=${token}`;

  if (!t) {
    console.log(`[DEV] Password reset URL for ${to}: ${resetUrl}`);
    return;
  }

  await t.sendMail({
    from: `"아파트 시세" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to,
    subject: '[아파트 시세] 비밀번호 재설정',
    html: `
      <div style="max-width:480px;margin:0 auto;font-family:-apple-system,'Noto Sans KR',sans-serif;">
        <div style="padding:32px 24px;background:#2563eb;border-radius:12px 12px 0 0;text-align:center;">
          <h1 style="color:white;margin:0;font-size:22px;">비밀번호 재설정</h1>
        </div>
        <div style="padding:32px 24px;background:white;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
          <p style="color:#333;font-size:15px;line-height:1.6;">
            비밀번호 재설정이 요청되었습니다.
          </p>
          <p style="color:#333;font-size:15px;line-height:1.6;">
            아래 버튼을 클릭하여 새 비밀번호를 설정해주세요.
          </p>
          <div style="text-align:center;margin:28px 0;">
            <a href="${resetUrl}" style="
              display:inline-block;padding:14px 40px;
              background:#2563eb;color:white;text-decoration:none;
              border-radius:8px;font-size:15px;font-weight:600;
            ">비밀번호 재설정하기</a>
          </div>
          <p style="color:#999;font-size:12px;line-height:1.5;">
            본인이 요청하지 않았다면 이 메일을 무시해주세요.<br>
            <a href="${resetUrl}" style="color:#2563eb;word-break:break-all;">${resetUrl}</a>
          </p>
          <p style="color:#999;font-size:12px;">이 링크는 1시간 동안 유효합니다.</p>
        </div>
      </div>
    `,
  });
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail };
