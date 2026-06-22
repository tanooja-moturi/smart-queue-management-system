"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.callNext = exports.updateEntryStatus = exports.getQueueEntries = exports.getEntryByToken = exports.joinQueue = void 0;
const db_1 = require("../config/db");
const isUUID = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
const joinQueue = async (req, res) => {
    const { code } = req.params;
    const { customerName } = req.body;
    try {
        if (!customerName || customerName.trim() === '') {
            return res.status(400).json({ message: 'Customer name is required' });
        }
        // 1. Find Queue
        const { data: queue } = await db_1.supabase
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
        const { data: existingEntry } = await db_1.supabase
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
        const { data: updatedQueueArray, error: rpcError } = await db_1.supabase
            .rpc('increment_queue_token', { queue_id: queue._id });
        if (rpcError || !updatedQueueArray || updatedQueueArray.length === 0) {
            return res.status(500).json({ message: rpcError?.message || 'Error generating token' });
        }
        const updatedQueue = updatedQueueArray[0];
        // 3. Format Token (e.g. A001, B015)
        const paddedNum = String(updatedQueue.lastTokenNumber).padStart(3, '0');
        const token = `${updatedQueue.tokenPrefix}${paddedNum}`;
        // 4. Create Entry
        const { data: entry, error: createError } = await db_1.supabase
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
    }
    catch (error) {
        return res.status(500).json({ message: error.message });
    }
};
exports.joinQueue = joinQueue;
const getEntryByToken = async (req, res) => {
    const { token } = req.params;
    const { queue } = req.query; // optional queue code or queueId to handle duplicate tokens
    try {
        let dbQuery = db_1.supabase
            .from('queue_entries')
            .select('*, queueId:queues(*)')
            .eq('token', token.toUpperCase());
        if (queue) {
            if (isUUID(queue)) {
                dbQuery = dbQuery.eq('queueId', queue);
            }
            else {
                const { data: foundQueue } = await db_1.supabase
                    .from('queues')
                    .select('_id')
                    .eq('queueCode', queue.toLowerCase())
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
        const queueId = entry.queueId._id;
        // People ahead: count waiting entries in the same queue that joined before this entry
        const { count: peopleAhead } = await db_1.supabase
            .from('queue_entries')
            .select('*', { count: 'exact', head: true })
            .eq('queueId', queueId)
            .eq('status', 'waiting')
            .lt('joinedAt', entry.joinedAt);
        // Currently serving: oldest with status 'called'
        const { data: currentServingEntry } = await db_1.supabase
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
            averageServiceTime: entry.queueId.averageServiceTime,
        });
    }
    catch (error) {
        return res.status(500).json({ message: error.message });
    }
};
exports.getEntryByToken = getEntryByToken;
const getQueueEntries = async (req, res) => {
    const { queueId } = req.params;
    try {
        const { data: entries, error } = await db_1.supabase
            .from('queue_entries')
            .select('*')
            .eq('queueId', queueId)
            .order('joinedAt', { ascending: true });
        if (error || !entries) {
            return res.status(500).json({ message: error?.message || 'Error fetching entries' });
        }
        return res.json(entries);
    }
    catch (error) {
        return res.status(500).json({ message: error.message });
    }
};
exports.getQueueEntries = getQueueEntries;
const updateEntryStatus = async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    try {
        if (!['waiting', 'called', 'served', 'skipped'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status value' });
        }
        const { data: entryExists } = await db_1.supabase
            .from('queue_entries')
            .select('*')
            .eq('_id', id)
            .maybeSingle();
        if (!entryExists) {
            return res.status(404).json({ message: 'Queue entry not found' });
        }
        const updateData = { status };
        if (status === 'called') {
            updateData.calledAt = new Date().toISOString();
        }
        else if (status === 'served') {
            updateData.servedAt = new Date().toISOString();
        }
        const { data: entry, error } = await db_1.supabase
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
    }
    catch (error) {
        return res.status(500).json({ message: error.message });
    }
};
exports.updateEntryStatus = updateEntryStatus;
const callNext = async (req, res) => {
    const { queueId } = req.params;
    try {
        // 1. Mark any currently 'called' customer as 'served'
        await db_1.supabase
            .from('queue_entries')
            .update({ status: 'served', servedAt: new Date().toISOString() })
            .eq('queueId', queueId)
            .eq('status', 'called');
        // 2. Find the oldest waiting customer for this queue
        const { data: nextEntry } = await db_1.supabase
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
        const { data: updatedEntry, error } = await db_1.supabase
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
    }
    catch (error) {
        return res.status(500).json({ message: error.message });
    }
};
exports.callNext = callNext;
