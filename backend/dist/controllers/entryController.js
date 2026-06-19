"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.callNext = exports.updateEntryStatus = exports.getQueueEntries = exports.getEntryByToken = exports.joinQueue = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const Queue_1 = __importDefault(require("../models/Queue"));
const QueueEntry_1 = __importDefault(require("../models/QueueEntry"));
const joinQueue = async (req, res) => {
    const { code } = req.params;
    const { customerName } = req.body;
    try {
        if (!customerName || customerName.trim() === '') {
            return res.status(400).json({ message: 'Customer name is required' });
        }
        // 1. Find Queue
        const queue = await Queue_1.default.findOne({ queueCode: code.toLowerCase() });
        if (!queue) {
            return res.status(404).json({ message: 'Queue not found' });
        }
        // Check if customer is already active in this queue (waiting or called)
        const trimmedName = customerName.trim();
        const existingEntry = await QueueEntry_1.default.findOne({
            queueId: queue._id,
            customerName: { $regex: new RegExp(`^${trimmedName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i') },
            status: { $in: ['waiting', 'called'] }
        });
        if (existingEntry) {
            return res.status(200).json(existingEntry);
        }
        // 2. Increment lastTokenNumber atomically and get updated queue
        const updatedQueue = await Queue_1.default.findByIdAndUpdate(queue._id, { $inc: { lastTokenNumber: 1 } }, { new: true });
        if (!updatedQueue) {
            return res.status(500).json({ message: 'Error generating token' });
        }
        // 3. Format Token (e.g. A001, B015)
        const paddedNum = String(updatedQueue.lastTokenNumber).padStart(3, '0');
        const token = `${updatedQueue.tokenPrefix}${paddedNum}`;
        // 4. Create Entry
        const entry = await QueueEntry_1.default.create({
            customerName: customerName.trim(),
            queueId: queue._id,
            token,
            status: 'waiting',
            joinedAt: new Date(),
        });
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
        let query = { token: token.toUpperCase() };
        if (queue) {
            if (mongoose_1.default.Types.ObjectId.isValid(queue)) {
                query.queueId = queue;
            }
            else {
                const foundQueue = await Queue_1.default.findOne({ queueCode: queue.toLowerCase() });
                if (foundQueue) {
                    query.queueId = foundQueue._id;
                }
            }
        }
        // Find the most recent entry with this token
        const entry = await QueueEntry_1.default.findOne(query)
            .populate('queueId')
            .sort({ joinedAt: -1 });
        if (!entry) {
            return res.status(404).json({ message: 'Queue entry not found' });
        }
        const queueId = entry.queueId._id;
        // People ahead: count waiting entries in the same queue that joined before this entry
        const peopleAhead = await QueueEntry_1.default.countDocuments({
            queueId,
            status: 'waiting',
            joinedAt: { $lt: entry.joinedAt }
        });
        // Currently serving: oldest with status 'called'
        const currentServingEntry = await QueueEntry_1.default.findOne({
            queueId,
            status: 'called'
        }).sort({ calledAt: -1 });
        return res.json({
            entry,
            peopleAhead,
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
        const entries = await QueueEntry_1.default.find({ queueId })
            .sort({ joinedAt: 1 });
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
        const entry = await QueueEntry_1.default.findById(id);
        if (!entry) {
            return res.status(404).json({ message: 'Queue entry not found' });
        }
        entry.status = status;
        if (status === 'called') {
            entry.calledAt = new Date();
        }
        else if (status === 'served') {
            entry.servedAt = new Date();
        }
        await entry.save();
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
        await QueueEntry_1.default.updateMany({ queueId, status: 'called' }, { status: 'served', servedAt: new Date() });
        // 2. Find the oldest waiting customer for this queue
        const nextEntry = await QueueEntry_1.default.findOne({ queueId, status: 'waiting' }).sort({ joinedAt: 1 });
        const io = req.app.get('io');
        if (!nextEntry) {
            // Broadcast update anyway because we marked previously called as served
            if (io) {
                io.to(queueId).emit('queue_updated', { queueId });
            }
            return res.json({ message: 'No customers waiting in queue', entry: null });
        }
        // 3. Mark next customer as called
        nextEntry.status = 'called';
        nextEntry.calledAt = new Date();
        await nextEntry.save();
        // 4. Broadcast the update
        if (io) {
            io.to(queueId).emit('queue_updated', { queueId });
            io.emit('customer_called', {
                queueId,
                token: nextEntry.token,
                customerName: nextEntry.customerName,
            });
        }
        return res.json(nextEntry);
    }
    catch (error) {
        return res.status(500).json({ message: error.message });
    }
};
exports.callNext = callNext;
