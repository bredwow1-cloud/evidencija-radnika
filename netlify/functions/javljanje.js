const { createClient } = require('@supabase/supabase-js');
const { verifyToken } = require('./_auth-helper');
const nodemailer = require('nodemailer');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json'
};

async function sendEmailNotification(radnik, status) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS || !process.env.ADMIN_EMAIL) return;
  try {
    const transporter = nodemailer.createTransporter({
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });
    const danas = new Date().toLocaleDateString('hr-HR');
    const statusText = status === 'dosao' ? 'DOSAO NA POSAO' : 'PRIJAVIO BOLOVANJE';
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.ADMIN_EMAIL,
      subject: `[Evidencija] ${radnik.ime} — ${statusText} (${danas})`,
      html: `
        <h2 style="color:#1a1a1a">Novo javljanje radnika</h2>
        <p><strong>Radnik:</strong> ${radnik.ime}</p>
        <p><strong>Status:</strong> ${status === 'dosao' ? '✅ Dosao na posao' : '🟡 Na bolovanju'}</p>
        <p><strong>Datum:</strong> ${danas}</p>
        <p><strong>Vrijeme:</strong> ${new Date().toLocaleTimeString('hr-HR')}</p>
        ${status === 'bolovanje' ? '<p style="color:#854F0B">⚠️ Radnik je na bolovanju — provjerite doznaku u admin panelu.</p>' : ''}
      `
    });
  } catch (err) {
    console.error('Email error:', err.message);
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const user = verifyToken(event);
  if (!user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Neovlašten pristup' }) };

  if (event.httpMethod === 'GET') {
    // Dohvati današnja javljanja (admin vidi sve, radnik samo svoje)
    const danas = new Date().toISOString().split('T')[0];
    let query = supabase
      .from('javljanja')
      .select(`*, radnici(ime, username)`)
      .eq('datum', danas)
      .order('created_at', { ascending: false });

    if (user.role !== 'admin') {
      query = query.eq('radnik_id', user.id);
    }

    const { data, error } = await query;
    if (error) return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  if (event.httpMethod === 'POST') {
    const { status } = JSON.parse(event.body || '{}');
    if (!['dosao', 'bolovanje'].includes(status)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Nevaljan status' }) };
    }

    const danas = new Date().toISOString().split('T')[0];

    // Provjeri je li se već javio danas
    const { data: existing } = await supabase
      .from('javljanja')
      .select('id')
      .eq('radnik_id', user.id)
      .eq('datum', danas)
      .single();

    let result;
    if (existing) {
      // Update ako se već javio
      result = await supabase
        .from('javljanja')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select()
        .single();
    } else {
      // Insert novo javljanje
      result = await supabase
        .from('javljanja')
        .insert({ radnik_id: user.id, datum: danas, status })
        .select()
        .single();
    }

    if (result.error) return { statusCode: 500, headers, body: JSON.stringify({ error: result.error.message }) };

    // Pošalji email notifikaciju u pozadini
    sendEmailNotification({ ime: user.ime }, status);

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, data: result.data }) };
  }

  return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
};
