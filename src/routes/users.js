const { Hono } = require('hono');
const userController = require('../controllers/userController');

const users = new Hono();

// GET /api/users - Get all users
users.get('/', userController.getAllUsers);

// POST /api/users - Create a new user
users.post('/', userController.createUser);

// GET /api/users/:id - Get user by ID
users.get('/:id', userController.getUserById);

// PUT /api/users/:id - Update user
users.put('/:id', userController.updateUser);

// DELETE /api/users/:id - Delete user
users.delete('/:id', userController.deleteUser);

module.exports = users;