const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const { verifyToken } = require('./_auth-helper');
const XLSX = require('xlsx');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const user = verifyToken(event);
  if (!user || user.role !== 'admin') {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Samo admin ima pristup' }) };
  }

  const path = event.path.replace(/.*\/admin\/?/, '');

  // GET /admin/radnici — lista svih radnika
  if (event.httpMethod === 'GET' && path === 'radnici') {
    const { data, error } = await supabase
      .from('radnici')
      .select('id, username, ime, role, active, mobitel, adresa, created_at')
      .order('ime');
    if (error) return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  // GET /admin/pregled — pregled javljanja za datum
  if (event.httpMethod === 'GET' && path.startsWith('pregled')) {
    const datum = event.queryStringParameters?.datum || new Date().toISOString().split('T')[0];
    const { data: sviRadnici } = await supabase
      .from('radnici')
      .select('id, ime, username, mobitel, adresa')
      .eq('role', 'radnik')
      .eq('active', true)
      .order('ime');

    const { data: javljanja } = await supabase
      .from('javljanja')
      .select('*, doznake(naziv_datoteke, public_url, datum)')
      .eq('datum', datum);

    const { data: doznake } = await supabase
      .from('doznake')
      .select('*, radnici(ime)')
      .eq('datum', datum);

    const pregled = (sviRadnici || []).map(r => {
      const javljanje = (javljanja || []).find(j => j.radnik_id === r.id);
      const dozn = (doznake || []).filter(d => d.radnik_id === r.id);
      return {
        ...r,
        status: javljanje?.status || 'nije',
        javljanje_time: javljanje?.created_at || null,
        mobitel: r.mobitel || null,
        adresa: r.adresa || null,
        doznake: dozn
      };
    });

    return { statusCode: 200, headers, body: JSON.stringify(pregled) };
  }

  // GET /admin/export — Excel export
  if (event.httpMethod === 'GET' && path.startsWith('export')) {
    const od = event.queryStringParameters?.od || new Date().toISOString().split('T')[0];
    const do_ = event.queryStringParameters?.do || od;

    const { data: javljanja } = await supabase
      .from('javljanja')
      .select('*, radnici(ime, username)')
      .gte('datum', od)
      .lte('datum', do_)
      .order('datum')
      .order('radnici(ime)');

    const rows = (javljanja || []).map(j => ({
      'Datum': j.datum,
      'Ime i prezime': j.radnici?.ime || '',
      'Username': j.radnici?.username || '',
      'Status': j.status === 'dosao' ? 'Na poslu' : j.status === 'bolovanje' ? 'Bolovanje' : 'Nije se javio',
      'Vrijeme javljanja': j.created_at ? new Date(j.created_at).toLocaleTimeString('hr-HR') : ''
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 12 }, { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Evidencija');
    const buf = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="evidencija_${od}_${do_}.xlsx"`,
        'Content-Transfer-Encoding': 'base64'
      },
      body: buf,
      isBase64Encoded: true
    };
  }

  // POST /admin/radnici — dodaj novog radnika
  if (event.httpMethod === 'POST' && path === 'radnici') {
    const { ime, username, password, role } = JSON.parse(event.body || '{}');
    if (!ime || !username || !password) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Nedostaju podaci' }) };
    }
    const hash = await bcrypt.hash(password, 10);
    const { data, error } = await supabase
      .from('radnici')
      .insert({ ime, username: username.toLowerCase().trim(), password_hash: hash, role: role || 'radnik', active: true })
      .select('id, ime, username, role, active')
      .single();
    if (error) return { statusCode: 400, headers, body: JSON.stringify({ error: error.message }) };
    return { statusCode: 201, headers, body: JSON.stringify(data) };
  }

  // DELETE /admin/radnici/:id
  if (event.httpMethod === 'DELETE' && path.startsWith('radnici/')) {
    const id = path.replace('radnici/', '');
    const { error } = await supabase.from('radnici').update({ active: false }).eq('id', id);
    if (error) return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
  }

  // PATCH /admin/radnici/:id — promjena lozinke
  if (event.httpMethod === 'PATCH' && path.startsWith('radnici/')) {
    const id = path.replace('radnici/', '');
    const { password } = JSON.parse(event.body || '{}');
    if (!password) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Nedostaje nova lozinka' }) };
    const hash = await bcrypt.hash(password, 10);
    const { error } = await supabase.from('radnici').update({ password_hash: hash }).eq('id', id);
    if (error) return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
  }

  return { statusCode: 404, headers, body: JSON.stringify({ error: 'Ruta nije pronađena' }) };
};
