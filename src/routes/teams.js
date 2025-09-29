const { Hono } = require('hono');
const { teamService, TeamNotFoundError, TeamAccessDeniedError, TeamValidationError } = require('../services/teamService');
const { teamMemberService, TeamMemberNotFoundError, TeamMemberAccessDeniedError, TeamMemberValidationError } = require('../services/teamMemberService');
const { jwtAuthMiddleware } = require('../middleware/auth');

const teams = new Hono();

teams.use('/*', jwtAuthMiddleware());

teams.post('/', async (c) => {
  try {
    const userId = c.get('user').id;
    const teamData = await c.req.json();

    const team = await teamService.createTeam(teamData, userId);

    return c.json({
      success: true,
      data: team
    }, 201);
  } catch (error) {
    if (error instanceof TeamValidationError) {
      return c.json({
        success: false,
        error: error.message
      }, 400);
    }

    console.error('Error creating team:', error);
    return c.json({
      success: false,
      error: 'Internal server error'
    }, 500);
  }
});

teams.get('/', async (c) => {
  try {
    const userId = c.get('user').id;

    const userTeams = await teamService.getUserTeams(userId);

    return c.json({
      success: true,
      data: userTeams
    });
  } catch (error) {
    if (error instanceof TeamValidationError) {
      return c.json({
        success: false,
        error: error.message
      }, 400);
    }

    console.error('Error getting user teams:', error);
    return c.json({
      success: false,
      error: 'Internal server error'
    }, 500);
  }
});

teams.get('/:teamId', async (c) => {
  try {
    const userId = c.get('user').id;
    const teamId = c.req.param('teamId');

    const team = await teamService.getTeamById(teamId, userId);

    return c.json({
      success: true,
      data: team
    });
  } catch (error) {
    if (error instanceof TeamNotFoundError) {
      return c.json({
        success: false,
        error: error.message
      }, 404);
    }

    if (error instanceof TeamAccessDeniedError || error instanceof TeamValidationError) {
      return c.json({
        success: false,
        error: error.message
      }, 403);
    }

    console.error('Error getting team:', error);
    return c.json({
      success: false,
      error: 'Internal server error'
    }, 500);
  }
});

teams.put('/:teamId', async (c) => {
  try {
    const userId = c.get('user').id;
    const teamId = c.req.param('teamId');
    const updateData = await c.req.json();

    const updatedTeam = await teamService.updateTeam(teamId, updateData, userId);

    return c.json({
      success: true,
      data: updatedTeam
    });
  } catch (error) {
    if (error instanceof TeamNotFoundError) {
      return c.json({
        success: false,
        error: error.message
      }, 404);
    }

    if (error instanceof TeamAccessDeniedError || error instanceof TeamValidationError) {
      return c.json({
        success: false,
        error: error.message
      }, 400);
    }

    console.error('Error updating team:', error);
    return c.json({
      success: false,
      error: 'Internal server error'
    }, 500);
  }
});

teams.delete('/:teamId', async (c) => {
  try {
    const userId = c.get('user').id;
    const teamId = c.req.param('teamId');

    const result = await teamService.deleteTeam(teamId, userId);

    return c.json({
      success: true,
      data: result
    });
  } catch (error) {
    if (error instanceof TeamNotFoundError) {
      return c.json({
        success: false,
        error: error.message
      }, 404);
    }

    if (error instanceof TeamAccessDeniedError) {
      return c.json({
        success: false,
        error: error.message
      }, 403);
    }

    if (error instanceof TeamValidationError) {
      return c.json({
        success: false,
        error: error.message
      }, 400);
    }

    console.error('Error deleting team:', error);
    return c.json({
      success: false,
      error: 'Internal server error'
    }, 500);
  }
});

teams.get('/:teamId/members', async (c) => {
  try {
    const userId = c.get('user').id;
    const teamId = c.req.param('teamId');

    const members = await teamMemberService.getTeamMembers(teamId, userId);

    return c.json({
      success: true,
      data: members
    });
  } catch (error) {
    if (error instanceof TeamMemberAccessDeniedError || error instanceof TeamMemberValidationError) {
      return c.json({
        success: false,
        error: error.message
      }, 403);
    }

    console.error('Error getting team members:', error);
    return c.json({
      success: false,
      error: 'Internal server error'
    }, 500);
  }
});

teams.post('/:teamId/members', async (c) => {
  try {
    const userId = c.get('user').id;
    const teamId = c.req.param('teamId');
    const { userIdToAdd, role } = await c.req.json();

    const newMember = await teamMemberService.addMemberToTeam(teamId, userIdToAdd, userId, role);

    return c.json({
      success: true,
      data: newMember
    }, 201);
  } catch (error) {
    if (error instanceof TeamMemberNotFoundError) {
      return c.json({
        success: false,
        error: error.message
      }, 404);
    }

    if (error instanceof TeamMemberAccessDeniedError || error instanceof TeamMemberValidationError) {
      return c.json({
        success: false,
        error: error.message
      }, 400);
    }

    console.error('Error adding team member:', error);
    return c.json({
      success: false,
      error: 'Internal server error'
    }, 500);
  }
});

teams.delete('/:teamId/members/:userId', async (c) => {
  try {
    const requesterId = c.get('user').id;
    const teamId = c.req.param('teamId');
    const userIdToRemove = c.req.param('userId');

    const result = await teamMemberService.removeMemberFromTeam(teamId, userIdToRemove, requesterId);

    return c.json({
      success: true,
      data: result
    });
  } catch (error) {
    if (error instanceof TeamMemberNotFoundError) {
      return c.json({
        success: false,
        error: error.message
      }, 404);
    }

    if (error instanceof TeamMemberAccessDeniedError || error instanceof TeamMemberValidationError) {
      return c.json({
        success: false,
        error: error.message
      }, 403);
    }

    console.error('Error removing team member:', error);
    return c.json({
      success: false,
      error: 'Internal server error'
    }, 500);
  }
});

teams.put('/:teamId/members/:userId/role', async (c) => {
  try {
    const requesterId = c.get('user').id;
    const teamId = c.req.param('teamId');
    const userIdToUpdate = c.req.param('userId');
    const { role } = await c.req.json();

    const updatedMember = await teamMemberService.updateMemberRole(teamId, userIdToUpdate, role, requesterId);

    return c.json({
      success: true,
      data: updatedMember
    });
  } catch (error) {
    if (error instanceof TeamMemberNotFoundError) {
      return c.json({
        success: false,
        error: error.message
      }, 404);
    }

    if (error instanceof TeamMemberAccessDeniedError || error instanceof TeamMemberValidationError) {
      return c.json({
        success: false,
        error: error.message
      }, 400);
    }

    console.error('Error updating member role:', error);
    return c.json({
      success: false,
      error: 'Internal server error'
    }, 500);
  }
});

module.exports = teams;