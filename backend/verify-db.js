require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function run() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing');
    return;
  }
  let normalizedUrl = supabaseUrl;
  if (normalizedUrl.endsWith('/')) {
    normalizedUrl = normalizedUrl.slice(0, -1);
  }
  if (normalizedUrl.endsWith('/rest/v1')) {
    normalizedUrl = normalizedUrl.slice(0, -8);
  }
  const supabase = createClient(normalizedUrl, supabaseKey);

  console.log('Connected to Supabase');
  const { data: entry, error } = await supabase
    .from('queue_entries')
    .select('*')
    .order('joinedAt', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error fetching latest entry:', error);
    return;
  }
  if (!entry) {
    console.log('No entries in DB');
    return;
  }

  const queueId = entry.queueId;
  const { count: waitingCount } = await supabase
    .from('queue_entries')
    .select('*', { count: 'exact', head: true })
    .eq('queueId', queueId)
    .eq('status', 'waiting');

  const { count: calledCount } = await supabase
    .from('queue_entries')
    .select('*', { count: 'exact', head: true })
    .eq('queueId', queueId)
    .eq('status', 'called');

  const { count: servedCount } = await supabase
    .from('queue_entries')
    .select('*', { count: 'exact', head: true })
    .eq('queueId', queueId)
    .eq('status', 'served');

  console.log(`Latest entry token: ${entry.token}`);
  console.log(`Queue: ${queueId}`);
  console.log(`Counts -> Waiting: ${waitingCount}, Called: ${calledCount}, Served: ${servedCount}`);
}

run().catch(console.error);
