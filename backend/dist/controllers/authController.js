"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMe = exports.loginUser = exports.registerUser = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const db_1 = require("../config/db");
const generateToken = (id) => {
    if (!process.env.JWT_SECRET) {
        throw new Error('JWT_SECRET environment variable is missing.');
    }
    return jsonwebtoken_1.default.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '30d',
    });
};
const registerUser = async (req, res) => {
    const { name, email, password, role } = req.body;
    try {
        const { data: userExists } = await db_1.supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .maybeSingle();
        if (userExists) {
            return res.status(400).json({ message: 'User already exists' });
        }
        const salt = await bcryptjs_1.default.genSalt(10);
        const hashedPassword = await bcryptjs_1.default.hash(password, salt);
        const { data: user, error } = await db_1.supabase
            .from('users')
            .insert({
            name,
            email,
            password: hashedPassword,
            role: role || 'staff',
        })
            .select()
            .single();
        if (error || !user) {
            return res.status(400).json({ message: error?.message || 'Invalid user data' });
        }
        return res.status(201).json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            token: generateToken(user._id.toString()),
        });
    }
    catch (error) {
        return res.status(500).json({ message: error.message });
    }
};
exports.registerUser = registerUser;
const loginUser = async (req, res) => {
    const { email, password } = req.body;
    try {
        const { data: user } = await db_1.supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .maybeSingle();
        if (user && (await bcryptjs_1.default.compare(password, user.password))) {
            return res.json({
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                token: generateToken(user._id.toString()),
            });
        }
        else {
            return res.status(401).json({ message: 'Invalid email or password' });
        }
    }
    catch (error) {
        return res.status(500).json({ message: error.message });
    }
};
exports.loginUser = loginUser;
const getMe = async (req, res) => {
    if (req.user) {
        return res.json({
            _id: req.user._id,
            name: req.user.name,
            email: req.user.email,
            role: req.user.role,
        });
    }
    else {
        return res.status(404).json({ message: 'User not found' });
    }
};
exports.getMe = getMe;
