import { Request, Response } from 'express';
import { supabase } from '../config/db';

const isUUID = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);

export const joinQueue = async (req: Request, res: Response) => {
  const { code } = req.params;
  const { customerName } = req.body;

  try {
    if (!customerName || customerName.trim() === '') {
      return res.status(400).json({ message: 'Customer name is required' });
    }

    // 1. Find Queue
    const { data: queue } = await supabase
      .from('queues')
      .select('*')
      .eq('queueCode', code.toLowerCase())
      .maybeSingle();

    if (!queue) {
      return res.status(404).json({ message: 'Queue not found' });
    }

    // Check if customer is already active in this queue (waiting or called)
    const trimmedName = customerName.trim();
    // Escape %, _ for PostgreSQL ILIKE
    const escapedName = trimmedName.replace(/[%_]/g, '\\$&');
    const { data: existingEntry } = await supabase
      .from('queue_entries')
      .select('*')
      .eq('queueId', queue._id)
      .ilike('customerName', escapedName)
      .in('status', ['waiting', 'called'])
      .maybeSingle();

    if (existingEntry) {
      return res.status(200).json(existingEntry);
    }

    // 2. Increment lastTokenNumber atomically and get updated queue via RPC
    const { data: updatedQueueArray, error: rpcError } = await supabase
      .rpc('increment_queue_token', { queue_id: queue._id });

    if (rpcError || !updatedQueueArray || updatedQueueArray.length === 0) {
      return res.status(500).json({ message: rpcError?.message || 'Error generating token' });
    }
    const updatedQueue = updatedQueueArray[0];

    // 3. Format Token (e.g. A001, B015)
    const paddedNum = String(updatedQueue.lastTokenNumber).padStart(3, '0');
    const token = `${updatedQueue.tokenPrefix}${paddedNum}`;

    // 4. Create Entry
    const { data: entry, error: createError } = await supabase
      .from('queue_entries')
      .insert({
        customerName: customerName.trim(),
        queueId: queue._id,
        token,
        status: 'waiting',
        joinedAt: new Date().toISOString(),
      })
      .select()
      .single();

    if (createError || !entry) {
      return res.status(500).json({ message: createError?.message || 'Error creating queue entry' });
    }

    // 5. Broadcast real-time update via socket
    const io = req.app.get('io');
    if (io) {
      io.to(queue._id.toString()).emit('queue_updated', { queueId: queue._id });
    }

    return res.status(201).json(entry);
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message });
  }
};

export const getEntryByToken = async (req: Request, res: Response) => {
  const { token } = req.params;
  const { queue } = req.query; // optional queue code or queueId to handle duplicate tokens

  try {
    let dbQuery = supabase
      .from('queue_entries')
      .select('*, queueId:queues(*)')
      .eq('token', token.toUpperCase());

    if (queue) {
      if (isUUID(queue as string)) {
        dbQuery = dbQuery.eq('queueId', queue);
      } else {
        const { data: foundQueue } = await supabase
          .from('queues')
          .select('_id')
          .eq('queueCode', (queue as string).toLowerCase())
          .maybeSingle();
        if (foundQueue) {
          dbQuery = dbQuery.eq('queueId', foundQueue._id);
        }
      }
    }

    // Find the most recent entry with this token
    const { data: entry } = await dbQuery
      .order('joinedAt', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!entry) {
      return res.status(404).json({ message: 'Queue entry not found' });
    }

    const queueId = (entry.queueId as any)._id;

    // People ahead: count waiting entries in the same queue that joined before this entry
    const { count: peopleAhead } = await supabase
      .from('queue_entries')
      .select('*', { count: 'exact', head: true })
      .eq('queueId', queueId)
      .eq('status', 'waiting')
      .lt('joinedAt', entry.joinedAt);

    // Currently serving: oldest with status 'called'
    const { data: currentServingEntry } = await supabase
      .from('queue_entries')
      .select('token')
      .eq('queueId', queueId)
      .eq('status', 'called')
      .order('calledAt', { ascending: false })
      .limit(1)
      .maybeSingle();

    return res.json({
      entry,
      peopleAhead: peopleAhead || 0,
      currentServing: currentServingEntry ? currentServingEntry.token : 'None',
      averageServiceTime: (entry.queueId as any).averageServiceTime,
    });
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message });
  }
};

export const getQueueEntries = async (req: Request, res: Response) => {
  const { queueId } = req.params;

  try {
    const { data: entries, error } = await supabase
      .from('queue_entries')
      .select('*')
      .eq('queueId', queueId)
      .order('joinedAt', { ascending: true });

    if (error || !entries) {
      return res.status(500).json({ message: error?.message || 'Error fetching entries' });
    }

    return res.json(entries);
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message });
  }
};

export const updateEntryStatus = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    if (!['waiting', 'called', 'served', 'skipped'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    const { data: entryExists } = await supabase
      .from('queue_entries')
      .select('*')
      .eq('_id', id)
      .maybeSingle();

    if (!entryExists) {
      return res.status(404).json({ message: 'Queue entry not found' });
    }

    const updateData: any = { status };
    if (status === 'called') {
      updateData.calledAt = new Date().toISOString();
    } else if (status === 'served') {
      updateData.servedAt = new Date().toISOString();
    }

    const { data: entry, error } = await supabase
      .from('queue_entries')
      .update(updateData)
      .eq('_id', id)
      .select()
      .single();

    if (error || !entry) {
      return res.status(500).json({ message: error?.message || 'Error updating entry' });
    }

    // Broadcast update
    const io = req.app.get('io');
    if (io) {
      io.to(entry.queueId.toString()).emit('queue_updated', { queueId: entry.queueId });
      
      if (status === 'called') {
        io.emit('customer_called', {
          queueId: entry.queueId,
          token: entry.token,
          customerName: entry.customerName,
        });
      }
    }

    return res.json(entry);
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message });
  }
};

export const callNext = async (req: Request, res: Response) => {
  const { queueId } = req.params;

  try {
    // 1. Mark any currently 'called' customer as 'served'
    await supabase
      .from('queue_entries')
      .update({ status: 'served', servedAt: new Date().toISOString() })
      .eq('queueId', queueId)
      .eq('status', 'called');

    // 2. Find the oldest waiting customer for this queue
    const { data: nextEntry } = await supabase
      .from('queue_entries')
      .select('*')
      .eq('queueId', queueId)
      .eq('status', 'waiting')
      .order('joinedAt', { ascending: true })
      .limit(1)
      .maybeSingle();

    const io = req.app.get('io');

    if (!nextEntry) {
      // Broadcast update anyway because we marked previously called as served
      if (io) {
        io.to(queueId).emit('queue_updated', { queueId });
      }
      return res.json({ message: 'No customers waiting in queue', entry: null });
    }

    // 3. Mark next customer as called
    const { data: updatedEntry, error } = await supabase
      .from('queue_entries')
      .update({ status: 'called', calledAt: new Date().toISOString() })
      .eq('_id', nextEntry._id)
      .select()
      .single();

    if (error || !updatedEntry) {
      return res.status(500).json({ message: error?.message || 'Error calling next customer' });
    }

    // 4. Broadcast the update
    if (io) {
      io.to(queueId).emit('queue_updated', { queueId });
      io.emit('customer_called', {
        queueId,
        token: updatedEntry.token,
        customerName: updatedEntry.customerName,
      });
    }

    return res.json(updatedEntry);
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message });
  }
};
