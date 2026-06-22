"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteQueue = exports.getQueueByCode = exports.getQueues = exports.createQueue = void 0;
const db_1 = require("../config/db");
const createQueue = async (req, res) => {
    const { queueName, queueCode, averageServiceTime } = req.body;
    try {
        if (!queueName || !queueCode || !averageServiceTime) {
            return res.status(400).json({ message: 'All fields are required' });
        }
        const codeNormalized = queueCode.trim().toLowerCase().replace(/\s+/g, '-');
        const { data: queueExists } = await db_1.supabase
            .from('queues')
            .select('*')
            .eq('queueCode', codeNormalized)
            .maybeSingle();
        if (queueExists) {
            return res.status(400).json({ message: 'Queue with this code already exists' });
        }
        // Extract first character of the queue name as token prefix, fallback to 'A'
        let prefix = queueName.trim().charAt(0).toUpperCase();
        if (!/^[A-Z]$/.test(prefix)) {
            prefix = 'A';
        }
        const { data: queue, error } = await db_1.supabase
            .from('queues')
            .insert({
            queueName,
            queueCode: codeNormalized,
            averageServiceTime: Number(averageServiceTime),
            tokenPrefix: prefix,
            lastTokenNumber: 0,
        })
            .select()
            .single();
        if (error || !queue) {
            return res.status(500).json({ message: error?.message || 'Error creating queue' });
        }
        return res.status(201).json(queue);
    }
    catch (error) {
        return res.status(500).json({ message: error.message });
    }
};
exports.createQueue = createQueue;
const getQueues = async (req, res) => {
    try {
        const { data: queues, error } = await db_1.supabase
            .from('queues')
            .select('*')
            .order('createdAt', { ascending: false });
        if (error || !queues) {
            return res.status(500).json({ message: error?.message || 'Error fetching queues' });
        }
        const queuesWithStats = await Promise.all(queues.map(async (queue) => {
            const { count: waitingCount } = await db_1.supabase
                .from('queue_entries')
                .select('*', { count: 'exact', head: true })
                .eq('queueId', queue._id)
                .eq('status', 'waiting');
            const { count: servedCount } = await db_1.supabase
                .from('queue_entries')
                .select('*', { count: 'exact', head: true })
                .eq('queueId', queue._id)
                .eq('status', 'served');
            const { data: activeEntry } = await db_1.supabase
                .from('queue_entries')
                .select('token')
                .eq('queueId', queue._id)
                .eq('status', 'called')
                .order('calledAt', { ascending: false })
                .limit(1)
                .maybeSingle();
            return {
                ...queue,
                waitingCount: waitingCount || 0,
                servedCount: servedCount || 0,
                currentServing: activeEntry ? activeEntry.token : 'None',
            };
        }));
        return res.json(queuesWithStats);
    }
    catch (error) {
        return res.status(500).json({ message: error.message });
    }
};
exports.getQueues = getQueues;
const getQueueByCode = async (req, res) => {
    const { code } = req.params;
    try {
        const { data: queue } = await db_1.supabase
            .from('queues')
            .select('*')
            .eq('queueCode', code.toLowerCase())
            .maybeSingle();
        if (!queue) {
            return res.status(404).json({ message: 'Queue not found' });
        }
        const { count: waitingCount } = await db_1.supabase
            .from('queue_entries')
            .select('*', { count: 'exact', head: true })
            .eq('queueId', queue._id)
            .eq('status', 'waiting');
        const { data: currentServingEntry } = await db_1.supabase
            .from('queue_entries')
            .select('token')
            .eq('queueId', queue._id)
            .eq('status', 'called')
            .order('calledAt', { ascending: false })
            .limit(1)
            .maybeSingle();
        return res.json({
            ...queue,
            waitingCount: waitingCount || 0,
            currentServing: currentServingEntry ? currentServingEntry.token : 'None',
        });
    }
    catch (error) {
        return res.status(500).json({ message: error.message });
    }
};
exports.getQueueByCode = getQueueByCode;
const deleteQueue = async (req, res) => {
    const { id } = req.params;
    try {
        const { data: queue } = await db_1.supabase
            .from('queues')
            .select('*')
            .eq('_id', id)
            .maybeSingle();
        if (!queue) {
            return res.status(404).json({ message: 'Queue not found' });
        }
        // Cascade delete: delete the queue and all its associated entries
        await db_1.supabase.from('queue_entries').delete().eq('queueId', id);
        await db_1.supabase.from('queues').delete().eq('_id', id);
        // Broadcast a socket event to update clients if needed, or simply return success
        const io = req.app.get('io');
        if (io) {
            // Broadcast that queue update happened so any tracking page can refresh or get notified
            io.to(id.toString()).emit('queue_updated', { queueId: id });
        }
        return res.json({ message: 'Queue and all associated entries deleted successfully', queueId: id });
    }
    catch (error) {
        return res.status(500).json({ message: error.message });
    }
};
exports.deleteQueue = deleteQueue;
