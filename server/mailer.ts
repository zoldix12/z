/**
 * وحدة إرسال رسائل البريد الإلكتروني عبر SMTP SSL (Port 465).
 * تشمل: أكواد تحقق تسجيل دخول العملاء عبر Gmail، تنبيهات وأكواد الإدارة الحصرية، ورسائل تفاصيل الطلبات الجديدة.
 */
import nodemailer from 'nodemailer';
import { getEffectiveSmtpConfig } from './store.ts';
import type { SubmittedOrderReceipt } from '../src/types/menu';

function escapeHtml(text: unknown): string {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function createTransporter(override?: {
  host?: string;
  port?: number;
  user?: string;
  pass?: string;
}) {
  const effective = getEffectiveSmtpConfig();
  const host = (override?.host ?? effective.host).trim();
  const port = Number(override?.port ?? effective.port ?? 465);
  const user = (override?.user ?? effective.user).trim();
  const pass = (override?.pass ?? effective.pass).trim();
  const fromEmail = (override?.user ?? effective.fromEmail ?? user).trim();

  if (!host || !user || !pass) {
    throw new Error('إعدادات البريد الإلكتروني SMTP غير مكتملة في متغيرات البيئة (SMTP_HOST / SMTP_USER / SMTP_PASS).');
  }

  return {
    user: fromEmail || user,
    transporter: nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
      connectionTimeout: 12_000,
      greetingTimeout: 12_000,
      socketTimeout: 15_000,
    }),
  };
}

export async function testSmtpConnection(config: {
  host: string;
  port: number;
  user: string;
  pass: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { transporter } = createTransporter(config);
    await transporter.verify();
    return { ok: true };
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : 'تعذر الاتصال بخادم البريد الإلكتروني';
    const isAuthErr = /535|Invalid login|Username and Password not accepted|EAUTH/i.test(rawMsg);
    const msg = isAuthErr
      ? 'فشل مصادقة البريد (تأكد من تفعيل التحقق بخطوتين واستخدام كلمة مرور تطبيقات Gmail App Password في SMTP_PASS).'
      : rawMsg;
    return { ok: false, error: msg };
  }
}

export async function sendCustomerOtpEmail(
  recipientEmail: string,
  code: string,
  brandName: string
): Promise<void> {
  const { user, transporter } = createTransporter();
  const safeBrand = escapeHtml(brandName);
  const safeCode = escapeHtml(code);

  const text = `مرحباً بك في مطعم ${brandName}\n\nرمز التحقق الخاص بتسجيل دخولك هو: ${code}\nصالح لمدة عشر دقائق فقط.\nإذا لم تطلب هذا الرمز يمكنك تجاهل هذه الرسالة بأمان.`;

  const html = `
  <div dir="rtl" style="font-family: Arial, Tahoma, sans-serif; background:#13100E; color:#EFE7DC; padding:28px; border-radius:16px; max-width:520px; margin:auto;">
    <h2 style="margin:0 0 12px; color:#DDA15E;">${safeBrand}</h2>
    <p style="margin:0 0 18px; color:#C7B9A8; line-height:1.7;">
      مرحباً بك، أدخل رمز التحقق التالي في الموقع لإتمام تسجيل الدخول وحفظ سلتك ومشترياتك:
    </p>
    <div style="background:#1B1613; border:1px solid #C96A3B; border-radius:12px; padding:18px; text-align:center; margin-bottom:18px;">
      <span style="font-size:32px; font-weight:800; letter-spacing:8px; color:#EFE7DC;" dir="ltr">${safeCode}</span>
    </div>
    <p style="margin:0; font-size:13px; color:#9A8B7A;">
      الرمز صالح لمدة عشر دقائق. يرجى عدم مشاركته مع أي شخص.
    </p>
  </div>`;

  await transporter.sendMail({
    from: `${brandName} <${user}>`,
    to: recipientEmail,
    subject: `رمز التحقق للدخول إلى ${brandName} : ${code}`,
    text,
    html,
  });
}

export async function sendInvitedAdminOtpEmail(
  recipientEmail: string,
  code: string,
  brandName: string
): Promise<void> {
  const { user, transporter } = createTransporter();
  const safeBrand = escapeHtml(brandName);
  const safeCode = escapeHtml(code);

  const text = `دعوة دخول مشرف إلى لوحة إدارة ${brandName}\n\nرمز التحقق الخاص بك هو: ${code}\nصالح لمدة عشر دقائق فقط.`;
  const html = `
  <div dir="rtl" style="font-family: Arial, Tahoma, sans-serif; background:#13100E; color:#EFE7DC; padding:28px; border-radius:16px; max-width:520px; margin:auto;">
    <h2 style="margin:0 0 12px; color:#DDA15E;">لوحة إدارة ${safeBrand}</h2>
    <p style="margin:0 0 18px; color:#C7B9A8; line-height:1.7;">
      تمت إضافتك كمشرف في إدارة الموقع، أدخل رمز التحقق التالي للدخول إلى لوحة التحكم:
    </p>
    <div style="background:#1B1613; border:1px solid #C96A3B; border-radius:12px; padding:18px; text-align:center; margin-bottom:18px;">
      <span style="font-size:32px; font-weight:800; letter-spacing:8px; color:#EFE7DC;" dir="ltr">${safeCode}</span>
    </div>
    <p style="margin:0; font-size:13px; color:#9A8B7A;">الرمز صالح لمدة عشر دقائق.</p>
  </div>`;

  await transporter.sendMail({
    from: `${brandName} Admin <${user}>`,
    to: recipientEmail,
    subject: `رمز دخول مشرف إلى ${brandName} : ${code}`,
    text,
    html,
  });
}

export async function sendAdminSecurityEmail(
  purpose: 'login_code' | 'login_alert' | 'password_reset_code' | 'password_changed',
  brandName: string,
  details?: { code?: string; ip?: string; time?: string }
): Promise<void> {
  const targetEmail = getEffectiveSmtpConfig().adminNotifyEmail;
  if (!targetEmail) {
    throw new Error('بريد الأمان الحصري للإدارة غير مضبوط.');
  }

  const { user, transporter } = createTransporter();
  const safeBrand = escapeHtml(brandName);
  const safeCode = escapeHtml(details?.code || '');
  const safeIp = escapeHtml(details?.ip || 'غير معروف');
  const safeTime = escapeHtml(details?.time || new Date().toLocaleString('ar-JO'));

  let subject = `تنبيه أمان الإدارة — ${brandName}`;
  let heading = 'تنبيه أمني من لوحة الإدارة';
  let body = '';

  if (purpose === 'login_code') {
    subject = `تأكيد دخول الإدارة إلى ${brandName} : ${details?.code || ''}`;
    heading = 'تأكيد تسجيل دخول لوحة الإدارة';
    body = `تم إدخال كلمة مرور الإدارة بنجاح، لإكمال الدخول يرجى إدخال رمز التأكيد التالي في الموقع:`;
  } else if (purpose === 'login_alert') {
    subject = `تم تسجيل دخول جديد إلى إدارة ${brandName}`;
    heading = 'دخول مؤكد إلى لوحة الإدارة';
    body = `تم تسجيل الدخول إلى لوحة التحكم بنجاح بتاريخ ${safeTime} من العنوان ${safeIp}.`;
  } else if (purpose === 'password_reset_code') {
    subject = `رمز تغيير كلمة مرور إدارة ${brandName} : ${details?.code || ''}`;
    heading = 'طلب تغيير كلمة مرور الإدارة';
    body = `وصلنا طلب لتغيير كلمة مرور لوحة التحكم، استخدم الرمز التالي لإتمام التغيير:`;
  } else {
    subject = `تم تغيير كلمة مرور إدارة ${brandName}`;
    heading = 'تحديث كلمة مرور الإدارة';
    body = `تم تغيير كلمة مرور لوحة الإدارة بنجاح بتاريخ ${safeTime} من العنوان ${safeIp}.`;
  }

  const codeBlock = details?.code
    ? `<div style="background:#1B1613; border:1px solid #C96A3B; border-radius:12px; padding:18px; text-align:center; margin:16px 0;">
         <span style="font-size:32px; font-weight:800; letter-spacing:8px; color:#EFE7DC;" dir="ltr">${safeCode}</span>
       </div>`
    : '';

  const text = `${brandName}\n${heading}\n${body}${details?.code ? `\nالرمز: ${details.code}` : ''}\nالتوقيت: ${details?.time || ''}\nIP: ${details?.ip || ''}`;

  const html = `
  <div dir="rtl" style="font-family: Arial, Tahoma, sans-serif; background:#13100E; color:#EFE7DC; padding:28px; border-radius:16px; max-width:540px; margin:auto;">
    <h2 style="margin:0 0 10px; color:#DDA15E;">${safeBrand} أمان الإدارة</h2>
    <h3 style="margin:0 0 12px; color:#EFE7DC;">${heading}</h3>
    <p style="margin:0 0 14px; color:#C7B9A8; line-height:1.7;">${body}</p>
    ${codeBlock}
    <p style="margin:14px 0 0; font-size:12px; color:#9A8B7A;">
      التوقيت: ${safeTime}<br/>
      العنوان الشبكي: ${safeIp}
    </p>
  </div>`;

  await transporter.sendMail({
    from: `${brandName} Security <${user}>`,
    to: targetEmail,
    subject,
    text,
    html,
  });
}

export async function sendOrderNotificationEmail(
  order: SubmittedOrderReceipt,
  brandName: string,
  extra: { mapUrl?: string; notes?: string }
): Promise<void> {
  const recipient = getEffectiveSmtpConfig().orderTo;
  if (!recipient) {
    throw new Error('بريد استقبال الطلبات غير مضبوط.');
  }

  const { user, transporter } = createTransporter();

  const itemsRows = order.items
    .map((item) => {
      const addonsText = item.addons.length > 0 ? `<br/><small style="color:#C7B9A8;">إضافات: ${escapeHtml(item.addons.map((a) => a.name).join('، '))}</small>` : '';
      const variantText = item.variantName ? ` (${escapeHtml(item.variantName)})` : '';
      const notesText = item.notes ? `<br/><small style="color:#DDA15E;">ملاحظة: ${escapeHtml(item.notes)}</small>` : '';
      return `
      <tr>
        <td style="padding:10px; border-bottom:1px solid #2c231e;">
          <strong>${escapeHtml(item.name)}${variantText}</strong>${addonsText}${notesText}
        </td>
        <td style="padding:10px; border-bottom:1px solid #2c231e; text-align:center;">${item.quantity}</td>
        <td style="padding:10px; border-bottom:1px solid #2c231e; text-align:left;">${item.lineTotal.toFixed(2)} ${escapeHtml(order.currency)}</td>
      </tr>`;
    })
    .join('');

  const textItems = order.items
    .map((item) => `- ${item.name}${item.variantName ? ` (${item.variantName})` : ''} × ${item.quantity} = ${item.lineTotal.toFixed(2)} ${order.currency}`)
    .join('\n');

  const isPaidOnline = order.paymentStatus === 'paid';
  const paymentSummaryLine = isPaidOnline
    ? `مدفوع إلكترونياً (${order.paymentProvider || 'Stripe'}) - رقم العملية: ${order.paymentTransactionId || '-'}`
    : 'الدفع عند الاستلام';

  const discountSummaryText = [
    order.couponCode ? `كود الخصم: ${order.couponCode} (-${order.discountAmount.toFixed(2)} ${order.currency})` : '',
    order.loyaltyDiscount > 0 ? `خصم نقاط الولاء (${order.loyaltyPointsUsed} نقطة): -${order.loyaltyDiscount.toFixed(2)} ${order.currency}` : '',
    order.loyaltyPointsEarned > 0 ? `نقاط الولاء المكتسبة: ${order.loyaltyPointsEarned}` : '',
  ].filter(Boolean).join('\n');

  const text = `طلب جديد رقم ${order.orderId} في ${brandName}\nحالة الدفع: ${paymentSummaryLine}\nالعميل: ${order.name || ''}\nالهاتف: ${order.phone || ''}\nالبريد: ${order.customerEmail || order.receiptEmail || 'ضيف'}\nالنوع: ${order.orderTypeLabel}\nالدفع: ${order.paymentMethod}\nالمنطقة: ${order.area || ''}\nالعنوان: ${order.address || ''}\nالخريطة: ${extra.mapUrl || 'غير مرفق'}\nملاحظات: ${extra.notes || 'لا يوجد'}\n\nالأصناف:\n${textItems}\n\nالمجموع الفرعي: ${order.subtotal.toFixed(2)} ${order.currency}\nالتوصيل: ${order.deliveryFee.toFixed(2)} ${order.currency}${discountSummaryText ? `\n${discountSummaryText}` : ''}\nالمجموع النهائي: ${order.total.toFixed(2)} ${order.currency}`;

  const paymentConfirmationHtml = isPaidOnline
    ? `<div style="background:#14281D; border:1px solid #34D399; border-radius:12px; padding:14px 16px; margin-bottom:18px; line-height:1.8;">
        <div style="color:#6EE7B7; font-weight:800; font-size:15px; margin-bottom:4px;">تأكيد الدفع الإلكتروني — مدفوع بالكامل</div>
        <div><strong>بوابة الدفع:</strong> ${escapeHtml(order.paymentProvider || 'Stripe')}</div>
        <div><strong>رقم المرجع للعملية:</strong> <span dir="ltr" style="font-family:monospace; color:#EFE7DC;">${escapeHtml(order.paymentTransactionId || '')}</span></div>
        ${order.paidAt ? `<div><strong>وقت التأكيد:</strong> ${escapeHtml(new Date(order.paidAt).toLocaleString('ar-JO'))}</div>` : ''}
      </div>`
    : `<div style="background:#241D19; border:1px solid #DDA15E; border-radius:12px; padding:12px 16px; margin-bottom:18px;">
        <strong style="color:#DDA15E;">حالة الدفع:</strong> ${escapeHtml(order.paymentMethod)} (يُحصل عند التسليم)
      </div>`;

  const html = `
  <div dir="rtl" style="font-family: Arial, Tahoma, sans-serif; background:#13100E; color:#EFE7DC; padding:26px; border-radius:16px; max-width:620px; margin:auto;">
    <h2 style="margin:0 0 6px; color:#DDA15E;">طلب جديد في ${escapeHtml(brandName)}</h2>
    <p style="margin:0 0 18px; color:#C7B9A8;">رقم الطلب: <strong style="color:#EFE7DC;">#${escapeHtml(order.orderId)}</strong></p>

    ${paymentConfirmationHtml}

    <div style="background:#1B1613; padding:16px; border-radius:12px; border:1px solid #2e241f; margin-bottom:18px; line-height:1.8;">
      <div><strong>الاسم:</strong> ${escapeHtml(order.name)}</div>
      <div><strong>الهاتف:</strong> <span dir="ltr">${escapeHtml(order.phone)}</span></div>
      ${order.customerEmail || order.receiptEmail ? `<div><strong>بريد العميل:</strong> ${escapeHtml(order.customerEmail || order.receiptEmail)}</div>` : ''}
      <div><strong>طريقة الاستلام:</strong> ${escapeHtml(order.orderTypeLabel)}</div>
      <div><strong>طريقة الدفع:</strong> ${escapeHtml(order.paymentMethod)}</div>
      <div><strong>المنطقة:</strong> ${escapeHtml(order.area)}</div>
      <div><strong>العنوان:</strong> ${escapeHtml(order.address)}</div>
      ${extra.mapUrl ? `<div><strong>الموقع على الخريطة:</strong> <a href="${escapeHtml(extra.mapUrl)}" style="color:#DDA15E;">فتح الموقع</a></div>` : ''}
      ${extra.notes ? `<div><strong>ملاحظات إضافية:</strong> ${escapeHtml(extra.notes)}</div>` : ''}
    </div>

    <table style="width:100%; border-collapse:collapse; background:#1B1613; border-radius:12px; overflow:hidden;">
      <thead>
        <tr style="background:#241D19; color:#DDA15E;">
          <th style="padding:10px; text-align:right;">الصنف</th>
          <th style="padding:10px; text-align:center;">الكمية</th>
          <th style="padding:10px; text-align:left;">السعر</th>
        </tr>
      </thead>
      <tbody>${itemsRows}</tbody>
    </table>

    <div style="margin-top:16px; background:#1B1613; padding:14px 16px; border-radius:12px; border:1px solid #C96A3B;">
      <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
        <span>المجموع الفرعي:</span>
        <strong>${order.subtotal.toFixed(2)} ${escapeHtml(order.currency)}</strong>
      </div>
      <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
        <span>التوصيل:</span>
        <strong>${order.deliveryFee.toFixed(2)} ${escapeHtml(order.currency)}</strong>
      </div>
      ${order.discountAmount > 0 ? `<div style="display:flex; justify-content:space-between; margin-bottom:6px; color:#86efac;">
        <span>خصم الكوبون${order.couponCode ? ` (${escapeHtml(order.couponCode)})` : ''}:</span>
        <strong>-${order.discountAmount.toFixed(2)} ${escapeHtml(order.currency)}</strong>
      </div>` : ''}
      ${order.loyaltyDiscount > 0 ? `<div style="display:flex; justify-content:space-between; margin-bottom:6px; color:#DDA15E;">
        <span>خصم نقاط الولاء (${order.loyaltyPointsUsed} نقطة):</span>
        <strong>-${order.loyaltyDiscount.toFixed(2)} ${escapeHtml(order.currency)}</strong>
      </div>` : ''}
      <div style="display:flex; justify-content:space-between; font-size:18px; color:#DDA15E;">
        <span>المجموع النهائي:</span>
        <strong>${order.total.toFixed(2)} ${escapeHtml(order.currency)}</strong>
      </div>
    </div>
  </div>`;

  const paidPrefix = isPaidOnline ? '[مدفوع إلكترونياً] ' : '';

  await transporter.sendMail({
    from: `${brandName} Orders <${user}>`,
    to: recipient,
    subject: `${paidPrefix}طلب جديد رقم ${order.orderId} من ${order.name || 'عميل'} — ${order.total.toFixed(2)} ${order.currency}`,
    text,
    html,
  });
}

export async function sendPaymentConfirmationEmail(
  recipientEmail: string,
  order: SubmittedOrderReceipt,
  brandName: string
): Promise<void> {
  const { user, transporter } = createTransporter();
  const safeBrand = escapeHtml(brandName);
  const isPaidOnline = order.paymentStatus === 'paid';

  const itemsHtml = order.items
    .map(
      (item) => `
      <tr>
        <td style="padding:8px 10px; border-bottom:1px solid #2c231e;">${escapeHtml(item.name)}${item.variantName ? ` (${escapeHtml(item.variantName)})` : ''}</td>
        <td style="padding:8px 10px; border-bottom:1px solid #2c231e; text-align:center;">${item.quantity}</td>
        <td style="padding:8px 10px; border-bottom:1px solid #2c231e; text-align:left;">${item.lineTotal.toFixed(2)} ${escapeHtml(order.currency)}</td>
      </tr>`
    )
    .join('');

  const text = `شكراً لطلبك من ${brandName}\nتم استلام طلبك رقم #${order.orderId}\n${
    isPaidOnline
      ? `تم تأكيد الدفع الإلكتروني بنجاح عبر ${order.paymentProvider || 'Stripe'}\nرقم مرجع العملية: ${order.paymentTransactionId || '-'}\n`
      : `طريقة الدفع: ${order.paymentMethod}\n`
  }المبلغ الإجمالي: ${order.total.toFixed(2)} ${order.currency}`;

  const html = `
  <div dir="rtl" style="font-family: Arial, Tahoma, sans-serif; background:#13100E; color:#EFE7DC; padding:26px; border-radius:16px; max-width:560px; margin:auto;">
    <h2 style="margin:0 0 8px; color:#DDA15E;">${safeBrand} — إيصال وتأكيد الطلب</h2>
    <p style="margin:0 0 16px; color:#C7B9A8;">
      أهلاً ${escapeHtml(order.name || 'بك')}، تم تسجيل طلبك رقم <strong style="color:#EFE7DC;">#${escapeHtml(order.orderId)}</strong> بنجاح.
    </p>

    <div style="background:${isPaidOnline ? '#14281D' : '#1B1613'}; border:1px solid ${isPaidOnline ? '#34D399' : '#C96A3B'}; border-radius:12px; padding:14px 16px; margin-bottom:18px; line-height:1.8;">
      <div style="font-weight:800; color:${isPaidOnline ? '#6EE7B7' : '#DDA15E'};">
        ${isPaidOnline ? 'تم تأكيد الدفع الإلكتروني بنجاح' : 'تأكيد استلام الطلب (الدفع عند الاستلام)'}
      </div>
      <div><strong>وسيلة الدفع:</strong> ${escapeHtml(order.paymentMethod)}</div>
      ${order.paymentTransactionId ? `<div><strong>رقم العملية المرجعي:</strong> <span dir="ltr" style="font-family:monospace;">${escapeHtml(order.paymentTransactionId)}</span></div>` : ''}
      <div><strong>المبلغ الإجمالي:</strong> ${order.total.toFixed(2)} ${escapeHtml(order.currency)}</div>
    </div>

    <table style="width:100%; border-collapse:collapse; background:#1B1613; border-radius:12px; overflow:hidden; margin-bottom:14px;">
      <thead>
        <tr style="background:#241D19; color:#DDA15E;">
          <th style="padding:8px 10px; text-align:right;">الصنف</th>
          <th style="padding:8px 10px; text-align:center;">الكمية</th>
          <th style="padding:8px 10px; text-align:left;">السعر</th>
        </tr>
      </thead>
      <tbody>${itemsHtml}</tbody>
    </table>

    <p style="margin:0; font-size:12px; color:#9A8B7A;">
      يمكنك متابعة حالة تجهيز وتوصيل طلبك مباشرة عبر موقع ${safeBrand}.
    </p>
  </div>`;

  await transporter.sendMail({
    from: `${brandName} <${user}>`,
    to: recipientEmail,
    subject: isPaidOnline
      ? `تأكيد الدفع الإلكتروني وإيصال الطلب #${order.orderId} من ${brandName}`
      : `تأكيد استلام طلبك #${order.orderId} من ${brandName}`,
    text,
    html,
  });
}
