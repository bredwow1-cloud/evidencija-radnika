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

  if (event.httpMethod === 'POST') {
    try {
      const body = JSON.parse(event.body);
      const { fileName, fileType, fileData, javljanje_id } = body;

      if (!fileData || !fileName || !fileType) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Nedostaju podaci datoteke' }) };
      }

      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
      if (!allowedTypes.includes(fileType)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Neprihvatljiv tip datoteke (dozvoljeno: PDF, JPG, PNG)' }) };
      }

      const buffer = Buffer.from(fileData, 'base64');
      if (buffer.length > 5 * 1024 * 1024) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Datoteka je prevelika (max 5 MB)' }) };
      }

      const danas = new Date().toISOString().split('T')[0];
      const ext = fileName.split('.').pop();
      const storagePath = `doznake/${user.id}/${danas}_${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('doznake')
        .upload(storagePath, buffer, { contentType: fileType, upsert: false });

      if (uploadError) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Greška pri uploadu: ' + uploadError.message }) };

      const { data: urlData } = supabase.storage.from('doznake').getPublicUrl(storagePath);

      const { data: doznaka, error: dbError } = await supabase
        .from('doznake')
        .insert({
          radnik_id: user.id,
          javljanje_id: javljanje_id || null,
          naziv_datoteke: fileName,
          storage_path: storagePath,
          public_url: urlData.publicUrl,
          datum: danas
        })
        .select()
        .single();

      if (dbError) return { statusCode: 500, headers, body: JSON.stringify({ error: dbError.message }) };

      return { statusCode: 200, headers, body: JSON.stringify({ success: true, doznaka }) };
    } catch (err) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Greška servera: ' + err.message }) };
    }
  }

  if (event.httpMethod === 'GET') {
    // Admin može vidjeti sve, radnik samo svoje
    const danes = new Date().toISOString().split('T')[0];
    let query = supabase
      .from('doznake')
      .select('*, radnici(ime)')
      .order('created_at', { ascending: false });

    if (user.role !== 'admin') {
      query = query.eq('radnik_id', user.id);
    }

    const { data, error } = await query;
    if (error) return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  }

  return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
};
