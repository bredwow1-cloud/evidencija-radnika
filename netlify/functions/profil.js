const { createClient } = require('@supabase/supabase-js');
const { verifyToken } = require('./_auth-helper');

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
  if (!user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Neovlašten pristup' }) };

  // GET — dohvati vlastiti profil
  if (event.httpMethod === 'GET') {
    const { data, error } = await supabase
      .from('radnici')
      .select('id, ime, username, mobitel, adresa, role')
      .eq('id', user.id)
      .single();
    if (error) return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  // PATCH — spremi mobitel i adresu
  if (event.httpMethod === 'PATCH') {
    const { mobitel, adresa } = JSON.parse(event.body || '{}');

    if (!mobitel || !adresa) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Mobitel i adresa su obavezni' }) };
    }

    const mobitelClean = mobitel.trim();
    const adresaClean = adresa.trim();

    if (mobitelClean.length < 8) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unesite ispravan broj mobitela' }) };
    }

    const { data, error } = await supabase
      .from('radnici')
      .update({ mobitel: mobitelClean, adresa: adresaClean })
      .eq('id', user.id)
      .select('id, ime, mobitel, adresa')
      .single();

    if (error) return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, data }) };
  }

  return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
};
