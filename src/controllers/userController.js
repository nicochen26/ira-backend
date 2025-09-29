const userService = require('../services/userService');

const createUser = async (c) => {
  try {
    const body = await c.req.json();
    const user = await userService.createUser(body);

    return c.json({
      success: true,
      data: user
    }, 201);
  } catch (error) {
    return c.json({
      success: false,
      error: error.message
    }, error.message.includes('already exists') ? 409 : 400);
  }
};

const getUserById = async (c) => {
  try {
    const { id } = c.req.param();
    const user = await userService.getUserById(id);

    return c.json({
      success: true,
      data: user
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error.message
    }, error.message === 'User not found' ? 404 : 400);
  }
};

const updateUser = async (c) => {
  try {
    const { id } = c.req.param();
    const body = await c.req.json();
    const user = await userService.updateUser(id, body);

    return c.json({
      success: true,
      data: user
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error.message
    }, error.message === 'User not found' ? 404 :
       error.message.includes('already exists') ? 409 : 400);
  }
};

const deleteUser = async (c) => {
  try {
    const { id } = c.req.param();
    await userService.deleteUser(id);

    return c.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error.message
    }, error.message === 'User not found' ? 404 : 400);
  }
};

const getAllUsers = async (c) => {
  try {
    const limit = parseInt(c.req.query('limit')) || 50;
    const offset = parseInt(c.req.query('offset')) || 0;

    const result = await userService.getAllUsers(limit, offset);

    return c.json({
      success: true,
      data: result
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
};

module.exports = {
  createUser,
  getUserById,
  updateUser,
  deleteUser,
  getAllUsers
};