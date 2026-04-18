const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const { username, password } = JSON.parse(event.body);
    if (!username || !password) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Nedostaju podaci' }) };

    const { data: user, error } = await supabase
      .from('radnici')
      .select('*')
      .eq('username', username.toLowerCase().trim())
      .single();

    if (error || !user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Pogrešno korisničko ime ili lozinka' }) };

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Pogrešno korisničko ime ili lozinka' }) };

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, ime: user.ime },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        token,
        user: { id: user.id, username: user.username, role: user.role, ime: user.ime }
      })
    };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Greška servera' }) };
  }
};
