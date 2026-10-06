/**
 * SIMA MHS Auth Email Gateway
 *
 * Dipakai sebagai Supabase Auth "Send Email" hook.
 * Untuk implementasi simpel, endpoint memakai shared query key.
 *
 * Script Properties:
 *   SIMA_AUTH_HOOK_KEY = isi dengan secret acak yang sama dengan
 *                        query parameter pada URL Send Email Hook.
 *
 * Deploy:
 *   Deploy > New deployment > Web app
 *   Execute as: Me
 *   Who has access: Anyone
 *
 * URL hook Supabase:
 *   https://script.google.com/macros/s/DEPLOYMENT_ID/exec?key=RAHASIA
 */

function doGet() {
  return json_({ ok: true, service: 'SIMA MHS Auth Email' });
}

function doPost(e) {
  try {
    const expected = PropertiesService
      .getScriptProperties()
      .getProperty('SIMA_AUTH_HOOK_KEY');

    const provided = String(e?.parameter?.key || '');

    if (!expected || provided !== expected) {
      return json_({ ok: false, error: 'Unauthorized' });
    }

    const payload = JSON.parse(e.postData?.contents || '{}');
    const user = payload.user || {};
    const emailData = payload.email_data || {};

    const email = String(user.email || '').trim();
    const action = String(emailData.email_action_type || '').trim();
    const tokenHash = String(emailData.token_hash || '').trim();
    const redirectTo = String(
      emailData.redirect_to || 'https://simawa.vercel.app/'
    ).trim();
    const siteUrl = String(
      emailData.site_url || 'https://simawa.vercel.app/'
    ).trim();

    if (!email || !tokenHash) {
      return json_({ ok: false, error: 'Payload Auth tidak lengkap.' });
    }

    const verifyUrl =
      siteUrl.replace(/\/$/, '') +
      '/auth/v1/verify?token=' +
      encodeURIComponent(tokenHash) +
      '&type=' +
      encodeURIComponent(action || 'recovery') +
      '&redirect_to=' +
      encodeURIComponent(redirectTo);

    let subject = 'SIMA MHS';
    let heading = 'SIMA MHS';

    if (action === 'recovery') {
      subject = 'Reset Password SIMA MHS';
      heading = 'Reset Password';
    } else if (action === 'signup') {
      subject = 'Verifikasi Akun SIMA MHS';
      heading = 'Verifikasi Akun';
    }

    const html =
      '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033">' +
      '<h2>' + heading + '</h2>' +
      '<p>Halo,</p>' +
      '<p>Permintaan autentikasi SIMA MHS diterima untuk <b>' +
      escapeHtml_(email) +
      '</b>.</p>' +
      '<p><a href="' +
      escapeHtml_(verifyUrl) +
      '" style="display:inline-block;padding:10px 16px;background:#123cc2;color:#fff;text-decoration:none;border-radius:8px">Buka SIMA MHS</a></p>' +
      '<p>Link ini hanya berlaku sesuai masa berlaku token Supabase. Jika Anda tidak meminta proses ini, abaikan email ini.</p>' +
      '</div>';

    const text =
      heading +
      '\n\n' +
      'Email: ' +
      email +
      '\n\n' +
      'Buka: ' +
      verifyUrl +
      '\n\n' +
      'Jika Anda tidak meminta proses ini, abaikan email ini.';

    MailApp.sendEmail({
      to: email,
      subject: subject,
      body: text,
      htmlBody: html,
      name: 'SIMA MHS'
    });

    return json_({ ok: true });
  } catch (err) {
    return json_({
      ok: false,
      error: String(err && err.message ? err.message : err)
    });
  }
}

function json_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function escapeHtml_(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
